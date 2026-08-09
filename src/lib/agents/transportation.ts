import { BaseAgent } from "./base";

/** Ground transport edge intelligence between two trip items. */
export class TransportationAgent extends BaseAgent {
  kind = "PLANNER" as const;

  async edgesBetween(fromId: string, toId: string) {
    const options = [
      { mode: "walking", minutes: 18, costUsd: 0, reliability: 0.99, accessibility: { stepFree: true } },
      { mode: "subway", minutes: 11, costUsd: 2.9, reliability: 0.93, accessibility: { stepFree: true } },
      { mode: "rideshare", minutes: 9, costUsd: 14, reliability: 0.95, accessibility: { stepFree: false } },
    ];
    await this.logAction({
      action: "transport_options",
      input: { fromId, toId },
      result: { options } as any,
    });
    return options;
  }
}
