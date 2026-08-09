import { prisma } from "@/server/db/client";
import type { AddItemInput, AddEdgeInput, TripWithGraph, NormalizedTripState, TravelerDNA, PlanningIntent } from "./types";
import { assertHardConstraints, scoreItinerary, type SymbolicTripState } from "../decision/engine";
import type { TripItemKind } from "../graph/types";
import { demoStore, isMemoryGraph } from "../demo/store";

export class TravelGraph {
  constructor(private userId: string) {}

  async createTrip(input: { title: string; destination: string; startDate?: Date; endDate?: Date; budgetUsd?: number }) {
    if (isMemoryGraph()) {
      return demoStore.createTrip(this.userId, input);
    }
    const trip = await prisma.trip.create({
      data: {
        userId: this.userId,
        title: input.title,
        destination: input.destination,
        startDate: input.startDate,
        endDate: input.endDate,
        status: "PLANNING",
        mode: "PLANNING",
        budgets: input.budgetUsd
          ? { create: { totalBudget: input.budgetUsd, currency: "USD", remaining: input.budgetUsd } }
          : undefined,
      },
      include: { budgets: true },
    });
    return trip;
  }

  async getTrip(query: { tripId: string }): Promise<TripWithGraph | null> {
    if (isMemoryGraph()) {
      // Prefer ownership check, but still resolve by id so Map OS / routing can
      // open any in-memory trip the UI lists (demo seeds + newly created).
      const owned = demoStore.getTrip(this.userId, query.tripId);
      if (owned) return owned as unknown as TripWithGraph;
      const any = demoStore.getTripById(query.tripId);
      return (any as unknown as TripWithGraph) ?? null;
    }
    const t = await prisma.trip.findFirst({
      where: { id: query.tripId, userId: this.userId },
      include: {
        items: { include: { flight: true, hotel: true, booking: true }, orderBy: [{ startTime: "asc" }] },
        budgets: true,
        alerts: { where: { resolved: false }, orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!t) return null;
    const edges = await prisma.tripEdge.findMany({
      where: { from: { tripId: t.id } },
    });
    const bookings = await prisma.booking.findMany({
      where: { tripItem: { tripId: t.id } },
    });
    return { ...t, edges, bookings } as unknown as TripWithGraph;
  }

  async listTrips() {
    if (isMemoryGraph()) {
      return demoStore.listTrips(this.userId);
    }
    return prisma.trip.findMany({
      where: { userId: this.userId },
      orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { items: true, alerts: { where: { resolved: false } } } },
        items: { orderBy: { startTime: "asc" } },
        budgets: true,
      },
    });
  }

  async addItem(tripId: string, input: AddItemInput) {
    if (isMemoryGraph()) {
      return demoStore.addItem(tripId, {
        kind: input.kind,
        title: input.title,
        status: input.status,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        payload: input.payload as Record<string, unknown> | undefined,
      });
    }
    const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: this.userId } });
    if (!trip) throw new Error("Trip not found");
    return prisma.tripItem.create({
      data: {
        tripId,
        kind: input.kind,
        title: input.title,
        status: input.status ?? "TENTATIVE",
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        lat: input.lat,
        lng: input.lng,
        address: input.address,
        provider: input.provider,
        providerRef: input.providerRef,
        confirmationCode: input.confirmationCode,
        payload: (input.payload ?? {}) as any,
      },
    });
  }

  async addEdge(tripId: string, input: AddEdgeInput) {
    const from = await prisma.tripItem.findFirst({ where: { id: input.fromId, tripId } });
    const to = await prisma.tripItem.findFirst({ where: { id: input.toId, tripId } });
    if (!from || !to) throw new Error("Trip item not found");
    return prisma.tripEdge.upsert({
      where: { fromId_toId_mode: { fromId: input.fromId, toId: input.toId, mode: input.mode ?? "WALKING" } },
      create: {
        fromId: input.fromId,
        toId: input.toId,
        mode: input.mode ?? "WALKING",
        minutes: input.minutes,
        cost: input.cost,
        currency: input.currency,
        reliability: input.reliability,
        walkingMeters: input.walkingMeters,
        accessibility: (input.accessibility ?? {}) as any,
        carbonKg: input.carbonKg,
      },
      update: {
        minutes: input.minutes,
        cost: input.cost,
        currency: input.currency,
        reliability: input.reliability,
        walkingMeters: input.walkingMeters,
        accessibility: input.accessibility as any,
        carbonKg: input.carbonKg,
      },
    });
  }

  /** Convert DB graph into deterministic symbolic state for the Decision Engine. */
  toSymbolic(trip: TripWithGraph, dna?: Partial<TravelerDNA>): NormalizedTripState {
    const dayMap = new Map<string, SymbolicTripState["days"][number]["items"]>();
    for (const it of trip.items) {
      if (!it.startTime) continue;
      const day = it.startTime.toISOString().slice(0, 10);
      const arr = dayMap.get(day) ?? [];
      const startMin = it.startTime.getHours() * 60 + it.startTime.getMinutes();
      const endMin = it.endTime ? it.endTime.getHours() * 60 + it.endTime.getMinutes() : startMin + 60;
      arr.push({
        id: it.id,
        kind: it.kind.toLowerCase(),
        startMinutes: startMin,
        endMinutes: endMin,
        costUsd: (it.payload as any)?.priceUsd,
        walkingMetersFromPrev: (it.payload as any)?.walkingMetersFromPrev,
        fixedTime: it.kind === "EVENT" || it.kind === "RESTAURANT",
      });
      dayMap.set(day, arr);
    }
    const days = [...dayMap.entries()].map(([date, items]) => ({ date, items }));
    const budget = trip.budgets?.[0];
    const symbolic: SymbolicTripState = {
      tripId: trip.id,
      travelers: 1,
      budgetUsd: Number(budget?.totalBudget ?? 0),
      spentUsd: Number(budget?.actual ?? 0),
      days,
      totalWalkingMetersPerDay: days.map((d) => d.items.reduce((a, i) => a + (i.walkingMetersFromPrev ?? 500), 0)),
      maxWalkingMetersPerDay: days.map(() => (dna?.physical?.walkingTolerance ?? 6) * 2500),
      sleepMinutesPerNight: days.map(() => 420),
      minSleepMinutes: 420,
    };
    const hard = assertHardConstraints(symbolic);
    const score = scoreItinerary({});
    return { symbolic, score, hardViolations: hard.violations };
  }
}

/** Natural-language → structured intent. Called by orchestrator. */
export function parsePlanningIntent(text: string, dna?: Partial<TravelerDNA>): PlanningIntent {
  // Lightweight deterministic parser — orchestrator's LLM layer refines this.
  const lower = text.toLowerCase();
  const budgetMatch = lower.match(/\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)(?:\s*(k|thousand))?/);
  const durationMatch = lower.match(/(\d+)\s*(?:day|night|week)s?/);
  const cityHints = [
    "tokyo", "kyoto", "osaka", "japan", "nyc", "new york", "paris", "london", "lisbon", "portugal",
    "bali", "iceland", "rome", "barcelona", "madrid", "seoul", "bangkok", "singapore", "mexico city",
    "marrakech", "cape town", "sydney", "melbourne", "vancouver", "miami", "austin", "chicago",
  ];
  const found = cityHints.find((c) => lower.includes(c));
  const destination = found
    ? found.replace(/\b\w/g, (c) => c.toUpperCase())
    : text.match(/to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1]
      ?? text.match(/in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1]
      ?? "custom";
  const budgetUsd = budgetMatch
    ? parseFloat(budgetMatch[1].replace(",", "")) * (budgetMatch[2] ? 1000 : 1)
    : undefined;
  const durationDays = durationMatch ? parseInt(durationMatch[1], 10) * (lower.includes("week") ? 7 : 1) : undefined;
  return {
    destination,
    durationDays,
    budgetUsd,
    travelers: /(we|us|two|couple|partner|girlfriend|family)/.test(lower) ? 2 : 1,
    priorities: {
      food: /food|eat|restaurant|dinner|lunch/.test(lower) ? 0.9 : 0.5,
      relaxation: /relax|slow|tired|rest/.test(lower) ? 0.8 : 0.3,
      museums: /museum|art|culture/.test(lower) ? 0.8 : 0.4,
      nightlife: /nightlife|bar|club|drinks/.test(lower) ? 0.7 : 0.3,
      accessibility: dna?.physical?.walkingTolerance ? 1 - dna.physical.walkingTolerance / 10 : 0.3,
    },
    avoid: lower.includes("no seafood") ? ["seafood"] : lower.includes("tourist") ? ["tourist traps"] : [],
  };
}

export function kindToDb(kind: string): TripItemKind {
  const k = kind.toUpperCase();
  const allowed: TripItemKind[] = ["FLIGHT", "HOTEL", "RESTAURANT", "ACTIVITY", "EVENT", "TRANSIT", "TRANSFER", "EXPERIENCE", "LANDMARK", "CUSTOM"];
  return allowed.includes(k as TripItemKind) ? (k as TripItemKind) : "CUSTOM";
}
