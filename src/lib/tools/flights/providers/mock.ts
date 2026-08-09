import type { FlightProvider, FlightOffer, FlightSearchParams, FlightStatusUpdate } from "../provider";

const REASON = "No flight provider configured — set AMADEUS_CLIENT_ID/SECRET for live fares";

/**
 * Offline provider for development and Sandbox scenarios.
 *
 * Everything it returns carries `isLive: false` so the UI can badge it. It
 * returns a spread of options rather than one flight, because a single
 * hardcoded result made itinerary logic look like it was choosing when it
 * wasn't.
 */
export class MockFlightProvider implements FlightProvider {
  name = "mock";

  async search(params: FlightSearchParams): Promise<FlightOffer[]> {
    const date = params.departureDate.slice(0, 10);
    const base = {
      provider: "simulated",
      origin: params.origin,
      destination: params.destination,
      cabin: params.cabin ?? "economy",
      currency: "USD",
      refundable: false,
      seatMapAvailable: false,
      stops: 0,
      isLive: false as const,
      simulatedReason: REASON,
    };
    return [
      { ...base, offerId: `SIM-${params.origin}-${params.destination}-A`, airline: "UA", airlineName: "United", flightNumber: "UA101", originTerminal: "7", destinationTerminal: "2", departureIso: `${date}T06:30:00Z`, arrivalIso: `${date}T09:45:00Z`, durationMinutes: 315, priceUsd: 287 },
      { ...base, offerId: `SIM-${params.origin}-${params.destination}-B`, airline: "DL", airlineName: "Delta", flightNumber: "DL422", originTerminal: "4", destinationTerminal: "3", departureIso: `${date}T09:15:00Z`, arrivalIso: `${date}T12:40:00Z`, durationMinutes: 325, priceUsd: 342 },
      { ...base, offerId: `SIM-${params.origin}-${params.destination}-C`, airline: "B6", airlineName: "JetBlue", flightNumber: "B681", originTerminal: "5", destinationTerminal: "1", departureIso: `${date}T12:00:00Z`, arrivalIso: `${date}T15:20:00Z`, durationMinutes: 320, priceUsd: 312 },
    ];
  }

  async price(offerId: string): Promise<FlightOffer | null> {
    const [first] = await this.search({
      origin: "JFK",
      destination: "LAX",
      departureDate: new Date().toISOString().slice(0, 10),
    });
    return { ...first, offerId };
  }

  async status(flightNumber: string, date: string): Promise<FlightStatusUpdate | null> {
    return {
      flightNumber,
      airline: flightNumber.replace(/[^A-Za-z]/g, "").slice(0, 2) || "XX",
      scheduledDeparture: `${date.slice(0, 10)}T10:00:00Z`,
      status: "on_time",
      isLive: false,
      simulatedReason: REASON,
    };
  }

  async book(offerId: string) {
    return { confirmation: `SIM-${offerId.slice(0, 8).toUpperCase()}` };
  }
}
