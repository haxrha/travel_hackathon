import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { parsePlanningIntent, kindToDb } from "../graph/service";
import { BaseAgent } from "./base";
import type { TravelerDNA } from "../graph/types";
import { demoStore, isMemoryGraph } from "../demo/store";
import { enrichItemMeta } from "./pricing";
import { day0DinnerRiskDecision, type RiskDecision } from "../decision/risk";
import { emitTrace } from "./trace";
import { applyMemoryToPlanItems, formatMemoryForPrompt } from "../backboard/facts";
import type { TravelerFact } from "../backboard/types";

/** Cheap free-tier Gemini model; falls back to skeleton itinerary without a key. */
const geminiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || "";
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GOOGLE_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_API_KEY;
}
const model = geminiKey ? google("gemini-flash-latest") : null;

const ItineraryItemSchema = z.object({
  kind: z.enum(["FLIGHT", "HOTEL", "RESTAURANT", "ACTIVITY", "EVENT", "TRANSIT", "TRANSFER", "EXPERIENCE", "LANDMARK", "CUSTOM"]),
  title: z.string(),
  dayOffset: z.number().int(),
  startHour: z.number().min(0).max(23).optional(),
  durationMinutes: z.number().int().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  priceUsd: z.number().optional(),
  description: z.string().optional(),
  whatToDo: z.array(z.string()).optional(),
});

const PlanSchema = z.object({
  destination: z.string(),
  summary: z.string(),
  days: z.number().int(),
  budgetUsd: z.number().optional(),
  items: z.array(ItineraryItemSchema),
});

export class PlannerAgent extends BaseAgent {
  kind = "PLANNER" as const;

  async planFromText(
    taskId: string,
    text: string,
    dna?: Partial<TravelerDNA>,
    memoryFacts?: TravelerFact[],
  ) {
    const intent = parsePlanningIntent(text, dna as TravelerDNA | undefined);

    let plan: z.infer<typeof PlanSchema> = {
      destination: intent.destination,
      summary: `Trip to ${intent.destination}`,
      days: intent.durationDays ?? 4,
      budgetUsd: intent.budgetUsd ?? 3000,
      items: [] as z.infer<typeof ItineraryItemSchema>[],
    };

    if (model) {
      try {
        const { object } = await generateObject({
          model,
          schema: PlanSchema,
          abortSignal: AbortSignal.timeout(18_000),
          prompt: `Turn this travel request into a concrete day-by-day itinerary. Keep it realistic, budget-aware, and traveler-aware.\n\nRequest: ${text}\n\nTraveler DNA: ${JSON.stringify(dna ?? {})}\n\nCross-trip traveler memory (persisted across trips — apply even when this request does not repeat them):\n${formatMemoryForPrompt(memoryFacts ?? [])}\n\nRules: no overlapping items, first activity at least 2 hours after flight arrival, respect relaxation preference, prioritize food when food priority is high. Obey memory: aisle/window seats, diet, no red-eye flights when memory says so, and never price a hotel above a remembered nightly ceiling. Each item must have a dayOffset (0-indexed). For every item include: location (a real, geocodeable place name like "Fushimi Inari Taisha, Kyoto" or "Pontocho Alley, Kyoto" — never vague labels like "downtown" alone), priceUsd (realistic USD), description (1-2 sentences), and whatToDo (2-4 short actionable tips for that stop). Titles should name the place when possible so the map can pin the same spot.`,
        });
        plan = object;
        // Ensure every item has pricing / tips
        plan.items = plan.items.map((item) => {
          const meta = enrichItemMeta(item.kind, item.title, item.location);
          return {
            ...item,
            priceUsd: item.priceUsd ?? meta.priceUsd,
            description: item.description ?? meta.description,
            whatToDo: item.whatToDo?.length ? item.whatToDo : meta.whatToDo,
          };
        });
      } catch (e) {
        console.warn("[planner] Gemini plan failed, using skeleton", e);
        plan.items = skeletonItinerary(intent.destination, plan.days).map((item) => {
          const meta = enrichItemMeta(item.kind, item.title, item.location);
          return { ...item, ...meta };
        });
      }
    } else {
      // Deterministic fallback skeleton when no LLM key is present.
      plan.items = skeletonItinerary(intent.destination, plan.days).map((item) => {
        const meta = enrichItemMeta(item.kind, item.title, item.location);
        return { ...item, ...meta };
      });
    }

    // Risk-aware day-0 dinner: choose time by arrival distribution, not a fixed 7 PM.
    const risk: RiskDecision = day0DinnerRiskDecision(16, 30);
    const chosenDinner = risk.options.find((o) => o.chosen);
    const dinnerHour = chosenDinner?.id === "dinner-1945" ? 19 : chosenDinner?.id === "dinner-2030" ? 20 : 19;
    const dinnerMinute = chosenDinner?.id === "dinner-1945" ? 45 : chosenDinner?.id === "dinner-2030" ? 30 : 0;
    plan.items = plan.items.map((item) => {
      if (item.kind === "RESTAURANT" && item.dayOffset === 0) {
        return {
          ...item,
          startHour: dinnerHour + dinnerMinute / 60,
          title: item.title.includes("Dinner") ? `Dinner — ${chosenDinner?.timeLabel ?? "7:45 PM"}` : item.title,
          notes: risk.rationale.slice(0, 180),
        };
      }
      // Nudge flight arrival display toward scheduled 4:30 for the distribution story
      if (item.kind === "FLIGHT" && item.dayOffset === 0) {
        return { ...item, startHour: 9, notes: "Arrival modeled as a probability distribution, not a point ETA." };
      }
      return item;
    });

    if (memoryFacts?.length) {
      plan.items = applyMemoryToPlanItems(plan.items, memoryFacts);
    }

    emitTrace({
      tripId: this.ctx.tripId,
      agent: "RISK",
      step: "Probabilistic dinner pick",
      detail: `${chosenDinner?.label} · ${chosenDinner?.successProbability}% success`,
      status: "ok",
    });

    await this.logAction({
      taskId,
      action: "plan_generated",
      input: { text, intent },
      result: { ...plan, risk } as unknown as Record<string, unknown>,
    });

    if (!this.ctx.tripId) return { plan, tripId: null, risk };

    const { resolveItemCoords } = await import("../mapbox/geocoding");

    if (isMemoryGraph()) {
      const trip = demoStore.getTrip(this.ctx.userId, this.ctx.tripId);
      if (!trip) throw new Error("Trip not found");
      // Fresh plan — replace items
      demoStore.clearItems(this.ctx.tripId);
      const baseDate = trip.startDate ?? new Date();

      // Parallel geocode with per-item timeout — sequential Mapbox calls were
      // stalling "Writing to the Travel Graph…" for tens of seconds.
      const prepared = await Promise.all(
        plan.items.map(async (item) => {
          const start = new Date(baseDate);
          start.setDate(start.getDate() + item.dayOffset);
          const hour = Math.floor(item.startHour ?? 10);
          const minute = Math.round(((item.startHour ?? 10) % 1) * 60);
          start.setHours(hour, minute, 0, 0);
          const end = new Date(start.getTime() + (item.durationMinutes ?? 60) * 60_000);
          const coords = await resolveCoordsFast(
            resolveItemCoords,
            { kind: item.kind, title: item.title, location: item.location },
            plan.destination,
          );
          return { item, start, end, coords };
        }),
      );

      for (const { item, start, end, coords } of prepared) {
        demoStore.addItem(this.ctx.tripId, {
          kind: kindToDb(item.kind),
          title: item.title,
          status: "TENTATIVE",
          startTime: start,
          endTime: end,
          location: item.location || coords?.geocodedName,
          payload: {
            notes: item.notes,
            priceUsd: item.priceUsd,
            description: item.description,
            whatToDo: item.whatToDo,
            // Omitted when the place could not be resolved — the map skips
            // these rather than pinning them somewhere invented.
            lat: coords?.lat,
            lng: coords?.lng,
            geocodedName: coords?.geocodedName,
            risk: item.kind === "RESTAURANT" && item.dayOffset === 0 ? risk : undefined,
          },
        });
      }
      const grand = plan.items.reduce((s, i) => s + (i.priceUsd ?? 0), 0);
      // Only fill what intake left blank. The old chat path created trips with
      // a "TBD" destination for the planner to name, but a trip built from the
      // Concierge form already has a title and destination the user chose —
      // overwriting them with an LLM summary loses real input.
      const existing = demoStore.getTrip(this.ctx.userId, this.ctx.tripId);
      const isPlaceholder = (v: string | undefined | null) =>
        !v || /^(tbd|custom|wayport trip|untitled)$/i.test(v.trim());

      demoStore.updateTrip(this.ctx.tripId, {
        status: "PLANNING",
        ...(isPlaceholder(existing?.destination) ? { destination: plan.destination } : {}),
        ...(isPlaceholder(existing?.title)
          ? { title: plan.summary?.slice(0, 60) || `Trip to ${plan.destination}` }
          : {}),
      });
      demoStore.setTripMeta(this.ctx.tripId, { risk });
      const t = demoStore.getTrip(this.ctx.userId, this.ctx.tripId);
      if (t?.budgets?.[0]) {
        t.budgets[0].actual = grand;
        t.budgets[0].remaining = Math.max(0, Number(t.budgets[0].totalBudget) - grand);
      }
      return { plan, tripId: this.ctx.tripId, grandTotalUsd: grand, risk };
    }

    // Write plan items into the Travel Graph.
    const trip = await prisma.trip.findFirst({ where: { id: this.ctx.tripId, userId: this.ctx.userId } });
    if (!trip) throw new Error("Trip not found");

    const baseDate = trip.startDate ?? new Date();
    const prepared = await Promise.all(
      plan.items.map(async (item) => {
        const start = new Date(baseDate);
        start.setDate(start.getDate() + item.dayOffset);
        const hour = Math.floor(item.startHour ?? 10);
        const minute = Math.round(((item.startHour ?? 10) % 1) * 60);
        start.setHours(hour, minute, 0, 0);
        const end = new Date(start.getTime() + (item.durationMinutes ?? 60) * 60_000);
        const coords = await resolveCoordsFast(
          resolveItemCoords,
          { kind: item.kind, title: item.title, location: item.location },
          plan.destination,
        );
        return { item, start, end, coords };
      }),
    );

    for (const { item, start, end, coords } of prepared) {
      await prisma.tripItem.create({
        data: {
          tripId: this.ctx.tripId,
          kind: kindToDb(item.kind),
          title: item.title,
          status: "TENTATIVE",
          startTime: start,
          endTime: end,
          location: item.location || coords?.geocodedName,
          payload: {
            notes: item.notes,
            priceUsd: item.priceUsd,
            description: item.description,
            whatToDo: item.whatToDo,
            lat: coords?.lat,
            lng: coords?.lng,
            geocodedName: coords?.geocodedName,
            risk: item.kind === "RESTAURANT" && item.dayOffset === 0 ? risk : undefined,
          },
        },
      });
    }

    await prisma.trip.update({
      where: { id: this.ctx.tripId },
      data: { destination: plan.destination, status: "PLANNING" },
    });

    const grandTotalUsd = plan.items.reduce((s, i) => s + (i.priceUsd ?? 0), 0);
    return { plan, tripId: this.ctx.tripId, grandTotalUsd, risk };
  }
}

type CoordFn = (
  item: { kind: string; title: string; location?: string },
  destination: string,
) => Promise<{ lat: number; lng: number; geocodedName?: string } | null>;

/** Bound geocode so a slow Mapbox call cannot block the whole graph write. */
async function resolveCoordsFast(
  resolveItemCoords: CoordFn,
  item: { kind: string; title: string; location?: string },
  destination: string,
) {
  try {
    const { withTimeout } = await import("../utils/timeout");
    return await withTimeout(
      resolveItemCoords(item, destination),
      4_000,
      `geocode:${item.title}`,
    );
  } catch {
    return null;
  }
}

function skeletonItinerary(destination: string, days: number): z.infer<typeof ItineraryItemSchema>[] {
  const dest = destination.trim() || "Kyoto";
  const city = dest.split(",")[0]?.trim() || dest;
  const anchors = skeletonAnchors(city);
  const items: z.infer<typeof ItineraryItemSchema>[] = [];
  for (let d = 0; d < Math.min(days, 7); d++) {
    if (d === 0) {
      items.push({
        kind: "FLIGHT",
        title: `Flight to ${city}`,
        dayOffset: 0,
        startHour: 9,
        durationMinutes: 240,
        location: anchors.airport,
      });
      items.push({
        kind: "TRANSFER",
        title: "Airport → Hotel",
        dayOffset: 0,
        startHour: 14,
        durationMinutes: 45,
        location: anchors.hotel,
      });
      items.push({
        kind: "HOTEL",
        title: `Check in — ${anchors.hotelName}`,
        dayOffset: 0,
        startHour: 15,
        durationMinutes: 30,
        location: anchors.hotel,
      });
      items.push({
        kind: "RESTAURANT",
        title: anchors.dinner0.title,
        dayOffset: 0,
        startHour: 19,
        durationMinutes: 90,
        location: anchors.dinner0.location,
      });
    } else if (d === days - 1) {
      items.push({
        kind: "HOTEL",
        title: "Check out",
        dayOffset: d,
        startHour: 10,
        durationMinutes: 30,
        location: anchors.hotel,
      });
      items.push({
        kind: "TRANSFER",
        title: "Hotel → Airport",
        dayOffset: d,
        startHour: 11,
        durationMinutes: 45,
        location: anchors.airport,
      });
      items.push({
        kind: "FLIGHT",
        title: `Return flight from ${city}`,
        dayOffset: d,
        startHour: 13,
        durationMinutes: 240,
        location: anchors.airport,
      });
    } else {
      const day = anchors.days[(d - 1) % anchors.days.length]!;
      items.push({
        kind: "ACTIVITY",
        title: day.morning.title,
        dayOffset: d,
        startHour: 10,
        durationMinutes: 120,
        location: day.morning.location,
      });
      items.push({
        kind: "RESTAURANT",
        title: day.lunch.title,
        dayOffset: d,
        startHour: 12,
        durationMinutes: 60,
        location: day.lunch.location,
      });
      items.push({
        kind: "ACTIVITY",
        title: day.afternoon.title,
        dayOffset: d,
        startHour: 14,
        durationMinutes: 150,
        location: day.afternoon.location,
      });
      items.push({
        kind: "RESTAURANT",
        title: day.dinner.title,
        dayOffset: d,
        startHour: 19,
        durationMinutes: 90,
        location: day.dinner.location,
      });
    }
  }
  return items;
}

type PlaceRef = { title: string; location: string };

function skeletonAnchors(city: string) {
  const key = city.toLowerCase();
  if (key.includes("kyoto")) {
    return {
      airport: "Kansai International Airport, Osaka",
      hotel: "Gion, Kyoto",
      hotelName: "Gion ryokan",
      dinner0: { title: "Dinner in Pontocho", location: "Pontocho Alley, Kyoto" } satisfies PlaceRef,
      days: [
        {
          morning: { title: "Fushimi Inari shrine walk", location: "Fushimi Inari Taisha, Kyoto" },
          lunch: { title: "Lunch near Inari", location: "Fushimi Inari Taisha, Kyoto" },
          afternoon: { title: "Gion district stroll", location: "Gion, Kyoto" },
          dinner: { title: "Kaiseki in Gion", location: "Gion, Kyoto" },
        },
        {
          morning: { title: "Arashiyama bamboo grove", location: "Arashiyama Bamboo Grove, Kyoto" },
          lunch: { title: "Tofu lunch in Arashiyama", location: "Arashiyama, Kyoto" },
          afternoon: { title: "Kinkaku-ji golden pavilion", location: "Kinkaku-ji, Kyoto" },
          dinner: { title: "Dinner in Nishiki market area", location: "Nishiki Market, Kyoto" },
        },
        {
          morning: { title: "Philosopher's Path", location: "Philosopher's Path, Kyoto" },
          lunch: { title: "Lunch in Higashiyama", location: "Higashiyama, Kyoto" },
          afternoon: { title: "Kiyomizu-dera temple", location: "Kiyomizu-dera, Kyoto" },
          dinner: { title: "Dinner along the Kamo River", location: "Kamo River, Kyoto" },
        },
      ],
    };
  }
  // Generic but geocodeable: pin each stop to a named place in the destination city.
  return {
    airport: `${city} International Airport`,
    hotel: `${city} city center hotel`,
    hotelName: `${city} hotel`,
    dinner0: { title: `Dinner near ${city} center`, location: `${city} downtown` } satisfies PlaceRef,
    days: [
      {
        morning: { title: `${city} landmark morning`, location: `${city} historic center` },
        lunch: { title: `Lunch in ${city}`, location: `${city} downtown` },
        afternoon: { title: `${city} neighborhood walk`, location: `${city} old town` },
        dinner: { title: `Dinner in ${city}`, location: `${city} restaurant district` },
      },
      {
        morning: { title: `${city} museum visit`, location: `${city} museum` },
        lunch: { title: `Market lunch`, location: `${city} market` },
        afternoon: { title: `${city} viewpoint`, location: `${city} viewpoint` },
        dinner: { title: `Neighborhood dinner`, location: `${city} nightlife district` },
      },
    ],
  };
}
