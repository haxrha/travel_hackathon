import { BaseAgent, type AgentContext } from "./base";
import { PlannerAgent } from "./planner";
import { GuardianAgent } from "./guardian";
import { FlightAgent } from "./flights";
import { HotelAgent } from "./hotels";
import { LocalAgent } from "./local";
import { emitEvent } from "../events/bus";
import type { TripEventType } from "../db-types";
import { demoStore, getOrCreateProfile, isMemoryGraph } from "../demo/store";
import { parsePlanningIntent } from "../graph/service";
import { scoreTripOptions } from "./pricing";
import { emitTrace } from "./trace";
import { persistTravelerMemory, recallTravelerMemory } from "../backboard/traveler";
import type { MemoryTurn } from "../backboard/types";
import { nightlyCeiling } from "../backboard/facts";
import { FinancialAgent } from "./financial";

/**
 * WAYPORT Orchestrator — routes input and events to the correct agent,
 * manages the Travel Graph mutation, and streams the activity feed.
 */
export class Orchestrator extends BaseAgent {
  kind = "PLANNER" as const;

  constructor(ctx: AgentContext) {
    super(ctx);
  }

  async handleUserMessage(
    text: string,
    opts: { specialists?: boolean } = { specialists: true },
  ) {
    const task = await this.startTask({ text, kind: "user_message" });
    emitTrace({ tripId: this.ctx.tripId, agent: "ORCHESTRATOR", step: "Parsing intent", status: "running" });
    const planner = new PlannerAgent(this.ctx);
    const profile = isMemoryGraph() ? getOrCreateProfile(this.ctx.userId) : null;
    const intent = parsePlanningIntent(text);
    emitTrace({
      tripId: this.ctx.tripId,
      agent: "ORCHESTRATOR",
      step: "Intent extracted",
      detail: `${intent.destination} · ${intent.durationDays ?? "?"}d · $${intent.budgetUsd ?? "?"}`,
      status: "ok",
    });
    const options = scoreTripOptions(
      intent.destination === "custom" ? "Your destination" : intent.destination,
      intent.durationDays ?? 4,
      intent.budgetUsd ?? 3000,
    );
    const pick = options[0];
    emitTrace({
      tripId: this.ctx.tripId,
      agent: "ROVE",
      step: "Scoring trip shapes",
      detail: `Winner ${pick.label} · ${pick.roveMiles} mi · score ${pick.score}`,
      status: "ok",
    });

    await this.logAction({
      taskId: task.id,
      action: "rove_options_scored",
      tool: "rove",
      input: { text, candidates: options.length },
      result: { winner: pick.id, score: pick.score, roveMiles: pick.roveMiles } as any,
      status: "INFO",
    });

    if (this.ctx.tripId) {
      demoStore.setTripMeta(this.ctx.tripId, {
        roveOptions: options,
        rovePick: pick,
      });
    }

    let memory: MemoryTurn | null = null;
    try {
      emitTrace({
        tripId: this.ctx.tripId,
        agent: "MEMORY",
        step: "Recalling cross-trip memory",
        status: "running",
      });
      memory = await recallTravelerMemory({
        userId: this.ctx.userId,
        tripId: this.ctx.tripId,
        text,
      });
      emitTrace({
        tripId: this.ctx.tripId,
        agent: "MEMORY",
        step: memory.recalled.length ? "Recalled traveler memory" : "No prior traveler memory",
        detail: memory.recalled.map((f) => f.content).join(" · ").slice(0, 180) || "New traveler thread",
        status: "ok",
      });
    } catch (err) {
      emitTrace({
        tripId: this.ctx.tripId,
        agent: "MEMORY",
        step: "Memory recall skipped",
        detail: err instanceof Error ? err.message : "unavailable",
        status: "warn",
      });
    }

    emitTrace({ tripId: this.ctx.tripId, agent: "PLANNER", step: "Drafting itinerary (Gemini / skeleton)", status: "running" });
    const planned = await planner.planFromText(task.id, text, profile?.dna as any, memory?.applied);
    const plan = planned.plan;
    emitTrace({
      tripId: this.ctx.tripId,
      agent: "PLANNER",
      step: "Itinerary written to Travel Graph",
      detail: `${plan?.items?.length ?? 0} nodes · ${plan?.destination}`,
      status: "ok",
    });

    const dest = plan?.destination ?? intent.destination ?? "destination";
    let hotelDecision = null as any;
    let localDecision = null as any;

    // Concierge create-trip path skips slow specialists so "Writing to the
    // Travel Graph" can finish; Map OS / Explore can enrich later.
    if (opts.specialists !== false) {
      try {
        emitTrace({ tripId: this.ctx.tripId, agent: "FLIGHTS", step: "Searching flight offers", status: "running" });
        const flights = new FlightAgent(this.ctx);
        const offers = await flights.searchOriginDestination("JFK", dest.slice(0, 3).toUpperCase() || "NRT", new Date().toISOString().slice(0, 10));
        emitTrace({
          tripId: this.ctx.tripId,
          agent: "FLIGHTS",
          step: "Flight offers ready",
          detail: `${Array.isArray(offers) ? offers.length : 0} normalized FlightOffer(s)`,
          status: "ok",
        });
      } catch {
        emitTrace({ tripId: this.ctx.tripId, agent: "FLIGHTS", step: "Flight search fallback", status: "warn" });
      }

      try {
        emitTrace({ tripId: this.ctx.tripId, agent: "HOTELS", step: "Searching Stay22 inventory", status: "running" });
        const hotels = new HotelAgent(this.ctx);
        const checkIn = new Date();
        checkIn.setDate(checkIn.getDate() + 14);
        const checkOut = new Date(checkIn);
        checkOut.setDate(checkOut.getDate() + (plan?.days ?? 4));
        const ceiling = nightlyCeiling(memory?.applied ?? []);
        const ranked = await hotels.search(
          dest,
          checkIn.toISOString().slice(0, 10),
          checkOut.toISOString().slice(0, 10),
          { walking: 0.7, budgetSensitivity: ceiling ? 0.9 : 0.5 },
          ceiling ? { nightlyCeilingUsd: ceiling } : undefined,
        );
        hotelDecision = (ranked as any).decision ?? null;
        if (this.ctx.tripId && hotelDecision) demoStore.setTripMeta(this.ctx.tripId, { hotelDecision });
        emitTrace({
          tripId: this.ctx.tripId,
          agent: "HOTELS",
          step: "Hotels ranked",
          detail: `${ranked.length} stays · top ${ranked[0]?.name ?? "—"}`,
          status: "ok",
        });
      } catch {
        emitTrace({ tripId: this.ctx.tripId, agent: "HOTELS", step: "Hotel search fallback", status: "warn" });
      }

      try {
        emitTrace({ tripId: this.ctx.tripId, agent: "LOCAL", step: "Tavily local discovery", status: "running" });
        const local = new LocalAgent(this.ctx);
        const spots = await local.discover(`best local experiences ${dest}`);
        localDecision = (spots as any).decision ?? null;
        if (this.ctx.tripId && localDecision) demoStore.setTripMeta(this.ctx.tripId, { localDecision });
        emitTrace({ tripId: this.ctx.tripId, agent: "LOCAL", step: "Local places enriched", status: "ok" });
      } catch {
        emitTrace({ tripId: this.ctx.tripId, agent: "LOCAL", step: "Local discovery fallback", status: "warn" });
      }
    } else {
      emitTrace({
        tripId: this.ctx.tripId,
        agent: "ORCHESTRATOR",
        step: "Specialists deferred",
        detail: "Flights / hotels / local will enrich after graph write",
        status: "ok",
      });
    }

    if (memory) {
      try {
        const financial = new FinancialAgent(this.ctx);
        await financial.enforceTravelerMemory(memory.applied);
        memory = await persistTravelerMemory({
          userId: this.ctx.userId,
          tripId: this.ctx.tripId,
          text,
          learned: memory.learned,
          applied: memory.applied,
        });
        emitTrace({
          tripId: this.ctx.tripId,
          agent: "MEMORY",
          step: memory.memoryMode === "Auto" ? "Saved with Backboard Auto" : "Saved to traveler memory",
          detail: memory.learned.map((f) => f.content).join(" · ").slice(0, 180) || "No new facts",
          status: memory.error ? "warn" : "ok",
        });
      } catch (err) {
        emitTrace({
          tripId: this.ctx.tripId,
          agent: "MEMORY",
          step: "Memory write skipped",
          detail: err instanceof Error ? err.message : "unavailable",
          status: "warn",
        });
      }
    }

    await this.logAction({
      taskId: task.id,
      action: "orchestrator_complete",
      input: { text, specialists: opts.specialists !== false },
      result: { destination: dest, items: plan?.items?.length ?? 0, rovePick: pick.id },
      status: "EXECUTED",
    });

    emitTrace({
      tripId: this.ctx.tripId,
      agent: "ORCHESTRATOR",
      step: "Complete",
      detail: "Graph + specialists synced",
      status: "ok",
    });

    await this.finishTask(task.id, { plan, options, pick });
    return {
      ...plan,
      options,
      rovePick: pick,
      risk: (planned as any).risk ?? null,
      memory,
      hotelDecision,
      localDecision,
      grandTotalUsd: (planned as any).grandTotalUsd ?? plan?.items?.reduce((s: number, i: any) => s + (i.priceUsd ?? 0), 0),
    };
  }

  async handleEvent(type: TripEventType, payload: Record<string, unknown>) {
    if (!this.ctx.tripId) throw new Error("Event handling requires tripId");
    await emitEvent(this.ctx.tripId, type, payload);

    if (isMemoryGraph()) {
      demoStore.addAlert(this.ctx.tripId, {
        title: type.replace(/_/g, " "),
        body: typeof payload.summary === "string" ? payload.summary : `Guardian received ${type}`,
        severity: type.includes("DELAY") || type.includes("CANCEL") ? "WARNING" : "INFO",
      });
    }

    switch (type) {
      case "FLIGHT_DELAYED":
      case "WEATHER_CHANGED":
      case "RESERVATION_CANCELLED":
      case "HOTEL_PRICE_CHANGED":
      case "USER_PREFERENCE_CHANGED": {
        const guardian = new GuardianAgent(this.ctx);
        return guardian.replan(type, payload);
      }
      case "BOOKING_CONFIRMED":
      case "VOICE_CALL_COMPLETED": {
        return this.logAction({ action: type, input: payload });
      }
      default:
        return this.logAction({ action: type, input: payload });
    }
  }
}
export const orchestrator = (userId: string, tripId?: string, autonomy = defaultAutonomy()) =>
  new Orchestrator({ userId, tripId, autonomy });

export function defaultAutonomy() {
  return {
    mode: "execute_with_approval" as const,
    autoBookHotelUnder: 250,
    autoBookFlightUnder: 400,
    autoBookRestaurants: true,
    autoBookChangesUnder: 100,
    allowInternationalFlights: false,
    notifyOnlyImportantDisruptions: true,
  };
}
