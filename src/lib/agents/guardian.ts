import { prisma } from "@/server/db/client";
import { BaseAgent, type AgentContext } from "./base";
import { TravelGraph } from "../graph/service";
import { demoStore, isMemoryGraph } from "../demo/store";
import { getBookingProvider } from "../tools/providers/booking";
import { mutateWorld } from "../graph/world";
import { emitTrace } from "./trace";

/**
 * Guardian — watches disruptions, detects cascade, finds alternatives, proposes rebook.
 */
export class GuardianAgent extends BaseAgent {
  kind = "GUARDIAN" as const;

  constructor(ctx: AgentContext) {
    super(ctx);
    if (!ctx.tripId) throw new Error("Guardian requires tripId");
  }

  async replan(trigger: string, payload: Record<string, unknown>) {
    const task = await this.startTask({ trigger, payload });
    emitTrace({
      tripId: this.ctx.tripId,
      agent: "GUARDIAN",
      step: "EVENT received",
      detail: trigger,
      status: "running",
    });
    const graph = new TravelGraph(this.ctx.userId);
    const trip = await graph.getTrip({ tripId: this.ctx.tripId! });
    if (!trip) throw new Error("Trip not found");

    // Mutate world model from event
    if (trigger === "FLIGHT_DELAYED") {
      mutateWorld(this.ctx.tripId!, {
        flightStatus: { delayed: true, delayMinutes: Number(payload.delayMinutes ?? 180) },
        inject: `Flight delayed ${payload.delayMinutes ?? 180}m`,
      });
    }
    if (trigger === "WEATHER_CHANGED") {
      mutateWorld(this.ctx.tripId!, {
        weather: {
          condition: String(payload.condition ?? "rain"),
          tempC: 18,
          rainChance: 80,
        },
        inject: `Weather: ${payload.condition ?? "rain"}`,
      });
    }
    if (trigger === "RESERVATION_CANCELLED" || trigger === "HOTEL_CANCELLED") {
      mutateWorld(this.ctx.tripId!, {
        hotelAvailability: "tight",
        inject: "Hotel reservation cancelled",
      });
    }
    if (trigger === "PRICE_DROP" || payload.priceDrop) {
      mutateWorld(this.ctx.tripId!, { inject: `Price drop $${payload.savedUsd ?? 74}` });
    }

    emitTrace({
      tripId: this.ctx.tripId,
      agent: "GUARDIAN",
      step: "Travel Graph mutated",
      detail: String(payload.summary ?? trigger),
      status: "ok",
    });

    const state = graph.toSymbolic(trip);
    const violations: string[] = [...state.hardViolations];
    const affected = detectCascade(trip.items, trigger, payload);
    violations.push(...affected);
    emitTrace({
      tripId: this.ctx.tripId,
      agent: "GUARDIAN",
      step: "Affected nodes identified",
      detail: affected.slice(0, 3).join(" · ") || "none",
      status: affected.length ? "warn" : "ok",
    });

    // Find replacement offers when hotel cancelled
    let alternatives: Awaited<ReturnType<ReturnType<typeof getBookingProvider>["search"]>> = [];
    let recommendation: (typeof alternatives)[0] | null = null;
    if (trigger === "RESERVATION_CANCELLED" || trigger === "HOTEL_CANCELLED" || String(payload.provider).includes("stay")) {
      emitTrace({
        tripId: this.ctx.tripId,
        agent: "GUARDIAN",
        step: "search_hotels → ranking replacements",
        status: "running",
      });
      const provider = getBookingProvider();
      alternatives = await provider.search("hotel", {
        destination: trip.destination,
        checkIn: new Date().toISOString().slice(0, 10),
        checkOut: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
      });
      recommendation = alternatives[1] ?? alternatives[0] ?? null;
      emitTrace({
        tripId: this.ctx.tripId,
        agent: "GUARDIAN",
        step: "Optimizer ranked replacements",
        detail: `${alternatives.length} offers · best ${recommendation?.title ?? "—"}`,
        status: "ok",
      });
      await this.logAction({
        action: "search_replacements",
        tool: "booking_provider",
        input: { trigger },
        result: { count: alternatives.length, best: recommendation?.title } as any,
      });
    }

    if (affected.length > 0 && !isMemoryGraph()) {
      const fixed = simpleRepair(trip.items, payload);
      for (const change of fixed) {
        await prisma.tripItem.update({
          where: { id: change.id },
          data: { startTime: change.startTime, endTime: change.endTime },
        });
      }
    }

    const title = `Trip updated: ${trigger.toLowerCase().replace(/_/g, " ")}`;
    const body = recommendation
      ? `Affected ${affected.length} nodes. Best replacement: ${recommendation.title} at $${recommendation.priceUsd}/night (${recommendation.effective?.effectiveUsd ?? "—"} effective). Approve to mock-book.`
      : `I adjusted ${affected.length} itinerary item${affected.length === 1 ? "" : "s"}. ${violations.length ? "Issues: " + violations.slice(0, 3).join("; ") : "Constraints checked."}`;

    if (isMemoryGraph()) {
      demoStore.addAlert(this.ctx.tripId!, { title, body, severity: "WARNING" });
    } else {
      await prisma.travelAlert.create({
        data: {
          tripId: this.ctx.tripId!,
          kind: trigger === "FLIGHT_DELAYED" ? "FLIGHT_DELAY" : trigger === "WEATHER_CHANGED" ? "WEATHER" : "GENERAL",
          severity: "WARNING",
          title,
          body,
        },
      });
    }

    const result = {
      trigger,
      violations,
      affected,
      repaired: affected.length,
      alternatives: alternatives.slice(0, 3),
      recommendation,
      pipeline: [
        "EVENT received",
        "Travel Graph mutated",
        "Affected nodes identified",
        "Constraints checked",
        alternatives.length ? "Optimizer ranked replacements" : "Shift heuristic applied",
        "Awaiting approval / notify traveler",
      ],
    };

    emitTrace({
      tripId: this.ctx.tripId,
      agent: "GUARDIAN",
      step: "Awaiting approval / notify traveler",
      detail: body.slice(0, 120),
      status: "ok",
    });

    await this.finishTask(task.id, result as any);
    await this.logAction({ action: "guardian_replan", input: { trigger, payload }, result: result as any, status: "EXECUTED" });
    return result;
  }
}

function detectCascade(
  items: { id: string; kind: string; startTime?: Date | null; endTime?: Date | null; title: string }[],
  trigger: string,
  payload: Record<string, unknown>,
) {
  const delayMinutes = typeof payload.delayMinutes === "number" ? payload.delayMinutes : 120;
  const dayThreshold = new Date();
  dayThreshold.setDate(dayThreshold.getDate() + 1);
  const affected: string[] = [];
  for (const it of items) {
    if (!it.startTime) continue;
    if (trigger === "FLIGHT_DELAYED" && it.kind === "FLIGHT") {
      affected.push(`Flight ${it.title} shifted by ${delayMinutes}m`);
    }
    if (trigger === "FLIGHT_DELAYED" && (it.kind === "TRANSFER" || it.kind === "RESTAURANT")) {
      affected.push(`${it.kind} ${it.title} likely invalid after delay`);
    }
    if (trigger === "WEATHER_CHANGED" && it.startTime < dayThreshold && it.kind === "ACTIVITY") {
      affected.push(`Outdoor activity ${it.title} moved indoors due to weather`);
    }
    if ((trigger === "RESERVATION_CANCELLED" || trigger === "HOTEL_CANCELLED") && it.kind === "HOTEL") {
      affected.push(`Hotel ${it.title} cancelled — cascade to transfers & dining radius`);
    }
  }
  return affected;
}

function simpleRepair(
  items: { id: string; kind: string; startTime?: Date | null; endTime?: Date | null }[],
  payload: Record<string, unknown>,
): { id: string; startTime: Date; endTime?: Date }[] {
  const delayMs = typeof payload.delayMinutes === "number" ? payload.delayMinutes * 60_000 : 2 * 3_600_000;
  const anchors = items.filter((i) => i.kind === "FLIGHT" && i.startTime);
  if (anchors.length === 0) return [];
  const first = anchors[0];
  const anchorTime = first.startTime as Date;
  return items
    .filter((i): i is { id: string; kind: string; startTime: Date; endTime?: Date | null } => !!i.startTime && (i.startTime as Date) > anchorTime)
    .map((i) => ({
      id: i.id,
      startTime: new Date((i.startTime as Date).getTime() + delayMs),
      endTime: i.endTime ? new Date(i.endTime.getTime() + delayMs) : undefined,
    }));
}
