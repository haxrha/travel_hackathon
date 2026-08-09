import { BaseAgent } from "./base";
import { getBookingProvider } from "../tools/providers/booking";
import { mutateWorld, getWorldSignals } from "../graph/world";
import { demoStore, isMemoryGraph } from "../demo/store";
import { TravelGraph } from "../graph/service";

/**
 * Live Travel Companion — contextual "what should I do right now?"
 */
export class CompanionAgent extends BaseAgent {
  kind = "RESEARCHER" as const;

  async now(context: {
    localTime?: string;
    neighborhood?: string;
    energy?: "low" | "medium" | "high";
  }) {
    if (!this.ctx.tripId) throw new Error("Live companion needs tripId");
    const trip = await new TravelGraph(this.ctx.userId).getTrip({ tripId: this.ctx.tripId });
    if (!trip) throw new Error("Trip not found");

    const world = getWorldSignals(this.ctx.tripId);
    const hour = context.localTime
      ? parseInt(context.localTime.split(":")[0] ?? "14", 10)
      : new Date().getHours();
    const energy = context.energy ?? (hour >= 20 ? "low" : "medium");
    const rain = world.weather.rainChance >= 50 || /rain/i.test(world.weather.condition);

    const upcoming = [...trip.items]
      .filter((i: any) => i.startTime)
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .find((i: any) => new Date(i.startTime).getHours() >= hour);

    const offers = await getBookingProvider().search("experience", {
      destination: trip.destination,
      query: rain
        ? `indoor museum cafe near ${context.neighborhood ?? trip.destination}`
        : `walkable local spot near ${context.neighborhood ?? trip.destination}`,
    });

    const pick = offers[0];
    const minutesAway = energy === "low" ? 8 : 14;
    const duration = energy === "low" ? 70 : 110;

    const advice = [
      `${hour}:${String(new Date().getMinutes()).padStart(2, "0")} · ${context.neighborhood ?? trip.destination}`,
      rain ? `Rain risk ${world.weather.rainChance}% — keep it nearby/indoors.` : `Weather ${world.weather.condition}, ${world.weather.tempC}°C.`,
      energy === "low" ? "Energy flagged low — avoid crosstown hops." : "Energy OK for a short walk.",
      upcoming
        ? `Next locked item: ${upcoming.title} — leave a buffer.`
        : "No hard reservation blocking the next 3 hours.",
      pick
        ? `Do this now: ${pick.title} (~${minutesAway} min away, ~${duration} min). Still comfortable before ${upcoming?.title ?? "evening plans"}.`
        : "Stay local and reset — café + short walk.",
    ];

    await this.logAction({
      action: "live_companion",
      tool: "world_model",
      input: context as any,
      result: { advice, offerId: pick?.id } as any,
    });

    return {
      mode: "LIVE",
      world,
      advice,
      suggestion: pick,
      airport: hour < 12
        ? { tip: "If departing today: lounge → security buffer 75m → gate." }
        : null,
      navigation: pick
        ? { etaMinutes: minutesAway, route: "Walk the short local corridor; avoid main avenue traffic." }
        : null,
    };
  }

  async setLiveMode() {
    if (!this.ctx.tripId) return;
    if (isMemoryGraph()) {
      demoStore.updateTrip(this.ctx.tripId, { mode: "LIVE", status: "ACTIVE" });
    }
  }
}

export { mutateWorld };
