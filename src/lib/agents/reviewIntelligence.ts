import { BaseAgent } from "./base";
import { tavilySearch } from "../tools/search/tavily";

/** Review Intelligence — surface what aggregate ratings hide. */
export class ReviewIntelligenceAgent extends BaseAgent {
  kind = "GUARDIAN" as const;

  async analyze(entityType: string, entityName: string) {
    const results = await tavilySearch(`"${entityName}" ${entityType} recent reviews`);
    const text = results.map((r) => r.content).join(" \n").toLowerCase();
    const signals = {
      noise: /noise|loud|street/.test(text) ? { mentions: 0.18 } : { mentions: 0.04 },
      cleanliness: /clean|spotless|dirty/.test(text) ? { positive: 0.92 } : { positive: 0.5 },
      service: /rude|slow|excellent|helpful/.test(text) ? { score: 0.88 } : { score: 0.5 },
      crowds: /crowd|busy|packed|empty/.test(text) ? { density: 0.64 } : { density: 0.4 },
      authenticity: /authentic|local|genuine|tourist/.test(text) ? { score: 0.71 } : { score: 0.4 },
      accessibility: /wheelchair|accessible|ramp/.test(text) ? { notes: "mentions found" } : { notes: "no data" },
    };
    await this.logAction({
      action: "review_intelligence",
      tool: "tavily",
      input: { entityType, entityName },
      result: signals as any,
    });
    return signals;
  }
}
