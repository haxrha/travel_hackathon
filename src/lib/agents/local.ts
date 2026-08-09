import { BaseAgent } from "./base";
import { tavilySearch } from "../tools/search/tavily";
import { rankByLocalness } from "../discovery/localness";
import { buildDecisionTrace, type DecisionTrace } from "../decision/transparency";
import { emitTrace } from "./trace";

export class LocalAgent extends BaseAgent {
  kind = "PLANNER" as const;

  async discover(query: string) {
    const results = await tavilySearch(query);
    const ranked = rankByLocalness(results);

    const decision: DecisionTrace = buildDecisionTrace({
      agent: "LOCAL",
      tool: "tavily+localness",
      question: "Which spot is most likely a place locals actually use?",
      candidates: ranked.map((r) => ({
        id: r.title,
        title: r.title,
        score: r.score,
        factors: [
          { key: "tourist", label: "Tourist density", value: r.breakdown.touristDensity },
          { key: "local", label: "Local review ratio", value: r.breakdown.localReviewRatio },
          { key: "chain", label: "Chain probability %", value: r.breakdown.chainProbability },
          { key: "creator", label: "Creator mentions", value: r.breakdown.creatorMentions },
          { key: "fit", label: "Neighborhood fit", value: r.breakdown.neighborhoodFit },
          { key: "dist", label: "Distance (min)", value: r.breakdown.distanceMinutes },
        ],
      })),
    });

    emitTrace({
      tripId: this.ctx.tripId,
      agent: "LOCAL",
      step: "Localness ranking",
      detail: decision.summary.slice(0, 140),
      status: "ok",
    });

    await this.logAction({
      action: "local_discovery",
      tool: "tavily",
      input: { query },
      result: { count: ranked.length, decision } as any,
    });

    // Backward-compatible shape for Explore page
    const enriched = ranked.map((r) => ({
      title: r.title,
      url: r.url ?? "#",
      content: r.content,
      locality: r.score,
      uniqueness: r.score,
      touristiness:
        r.breakdown.touristDensity === "high" ? 80 : r.breakdown.touristDensity === "moderate" ? 45 : 22,
      localness: r,
      decision,
    }));

    return Object.assign(enriched, { decision, ranked });
  }
}
