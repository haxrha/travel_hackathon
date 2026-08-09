/**
 * Flight Provider Abstraction — the Travel Graph only ever sees FlightOffer.
 * Any airline or OTA provider is normalized through this interface.
 */

/** One physical flight within an offer. A non-stop itinerary has exactly one. */
export interface FlightSegment {
  carrierCode: string;
  carrierName?: string;
  flightNumber: string;
  origin: string;
  originTerminal?: string;
  destination: string;
  destinationTerminal?: string;
  departureIso: string;
  arrivalIso: string;
  durationMinutes?: number;
  aircraftCode?: string;
  aircraftName?: string;
  cabin?: string;
  bookingClass?: string;
}

export interface FlightOffer {
  provider: string;
  offerId: string;
  airline: string;
  airlineName?: string;
  flightNumber: string;
  origin: string;
  originTerminal?: string;
  destination: string;
  destinationTerminal?: string;
  departureIso: string;
  arrivalIso: string;
  durationMinutes: number;
  cabin: string;
  bookingClass?: string;
  priceUsd: number;
  currency: string;
  baggage?: BaggageAllowance;
  bookingUrl?: string;
  refundable: boolean;
  seatMapAvailable: boolean;
  aircraft?: string;
  aircraftName?: string;
  /** Connection count for the outbound itinerary. */
  stops?: number;
  /** Every leg, so the trip page can show connections and terminals. */
  segments?: FlightSegment[];
  seatsRemaining?: number;
  /**
   * False when the offer came from a simulator rather than a live provider.
   * The UI must badge these — an invented fare shown as real is worse than
   * showing nothing.
   */
  isLive: boolean;
  /** Why the data is simulated, when it is. Surfaced in the UI. */
  simulatedReason?: string;
}

export interface BaggageAllowance {
  carryOnBags: number;
  checkedBags: number;
  checkedBagPriceUsd?: number;
  weightKg?: number;
}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string; // ISO
  returnDate?: string;
  passengers?: number;
  cabin?: "economy" | "premium" | "business" | "first";
  maxPriceUsd?: number;
  directOnly?: boolean;
}

export interface FlightStatusUpdate {
  flightNumber: string;
  airline: string;
  scheduledDeparture: string;
  estimatedDeparture?: string;
  status: "on_time" | "delayed" | "cancelled" | "boarding" | "departed" | "arrived";
  delayMinutes?: number;
  gate?: string;
  terminal?: string;
  arrivalTerminal?: string;
  arrivalGate?: string;
  scheduledArrival?: string;
  aircraftCode?: string;
  /** See FlightOffer.isLive — same contract. */
  isLive: boolean;
  simulatedReason?: string;
}

export interface FlightProvider {
  name: string;
  search(params: FlightSearchParams): Promise<FlightOffer[]>;
  /** `rawOffer` is the provider's original offer body, required for re-pricing. */
  price(offerId: string, rawOffer?: unknown): Promise<FlightOffer | null>;
  status(flightNumber: string, date: string): Promise<FlightStatusUpdate | null>;
  book(offerId: string, passengers: object[]): Promise<{ confirmation: string; bookingUrl?: string }>;
}
