import { BaseAgent, type AgentContext } from "./base";
import { searchHotels, wayportMatchScore } from "../tools/hotels/stay22";
import { buildDecisionTrace, type DecisionTrace, type RankedCandidate } from "../decision/transparency";
import { emitTrace } from "./trace";

export class HotelAgent extends BaseAgent {
  kind = "PLANNER" as const;

  constructor(ctx: AgentContext) {
    super(ctx);
  }

  async search(destination: string, checkIn: string, checkOut: string, prefs: Record<string, number>) {
    const results = await searchHotels({ destination, checkIn, checkOut });
    const ranked = results
      .map((h) => ({ ...h, wayportMatch: wayportMatchScore(h, prefs) }))
      .sort((a, b) => b.wayportMatch - a.wayportMatch);

    const candidates: RankedCandidate[] = ranked.map((h) => ({
      id: h.id,
      title: h.name,
      score: h.wayportMatch,
      factors: [
        { key: "walk", label: "Walkability", value: h.walkability ?? 70, weight: 0.4 },
        { key: "price", label: "Price/night", value: h.pricePerNight, weight: -0.3 },
        { key: "stars", label: "Stars", value: h.starRating ?? 4 },
        { key: "live", label: "Live inventory", value: h.live ? 1 : 0 },
        { key: "noise", label: "Noise (lower better)", value: Math.round((h.noiseScore ?? 0.2) * 100) },
      ],
    }));

    const decision: DecisionTrace = buildDecisionTrace({
      agent: "HOTELS",
      tool: "stay22",
      question: `Which stay in ${destination} best fits walkability + budget sensitivity?`,
      candidates,
    });

    emitTrace({
      tripId: this.ctx.tripId,
      agent: "HOTELS",
      step: "Decision",
      detail: decision.summary.slice(0, 140),
      status: "ok",
    });

    await this.logAction({
      action: "search_hotels",
      tool: "stay22",
      input: { destination, checkIn, checkOut, prefs },
      result: { count: ranked.length, decision } as any,
    });

    return Object.assign(ranked, { decision });
  }
}
