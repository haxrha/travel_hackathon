import type { FlightProvider, FlightOffer } from "./provider";
import { AmadeusProvider, amadeusConfigured } from "./providers/amadeus";
import { MockFlightProvider } from "./providers/mock";

let current: FlightProvider | null = null;

export function getFlightProvider(): FlightProvider {
  if (current) return current;
  // Amadeus itself degrades to clearly-flagged simulated offers when a call
  // fails, so prefer it whenever credentials exist rather than deciding here.
  current = amadeusConfigured() ? new AmadeusProvider() : new MockFlightProvider();
  return current;
}

export function setFlightProvider(provider: FlightProvider) {
  current = provider;
}

/** Clears the memoized provider — call after changing credentials at runtime. */
export function resetFlightProvider() {
  current = null;
}

/** True when flight data can be live. Used to badge the UI honestly. */
export function flightsAreLive(): boolean {
  return amadeusConfigured();
}

export async function searchFlights(
  params: Parameters<FlightProvider["search"]>[0],
): Promise<FlightOffer[]> {
  return getFlightProvider().search(params);
}
