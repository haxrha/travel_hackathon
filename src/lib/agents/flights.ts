import { BaseAgent, type AgentContext } from "./base";
import { getFlightProvider } from "../tools/flights/normalize";

export class FlightAgent extends BaseAgent {
  kind = "PLANNER" as const;

  constructor(ctx: AgentContext) {
    super(ctx);
  }

  async searchOriginDestination(origin: string, destination: string, departureDateIso: string) {
    const provider = getFlightProvider();
    const offers = await provider.search({ origin, destination, departureDate: departureDateIso });
    await this.logAction({
      action: "search_flights",
      tool: provider.name,
      input: { origin, destination, departureDateIso },
      result: { offers } as any,
    });
    return offers;
  }

  async status(flightNumber: string, dateIso: string) {
    const provider = getFlightProvider();
    return provider.status(flightNumber, dateIso);
  }
}
