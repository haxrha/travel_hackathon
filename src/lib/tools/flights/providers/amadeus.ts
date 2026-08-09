/* eslint-disable @typescript-eslint/no-explicit-any --
 * This module narrows untyped Amadeus JSON into FlightOffer. The `any` uses are
 * confined to raw response objects inside the normalizer; everything crossing
 * the module boundary is fully typed.
 */

import type {
  FlightProvider,
  FlightOffer,
  FlightSearchParams,
  FlightSegment,
  FlightStatusUpdate,
} from "../provider";

/**
 * Amadeus Self-Service provider.
 *
 * Two rules this file exists to enforce:
 *
 *  1. Never let a failure masquerade as a live fare. Earlier revisions returned
 *     invented offers from every error path, so an expired token or a bad route
 *     produced confident-looking prices that were fiction. Failures now surface
 *     as `isLive: false` with the reason attached, and the UI badges them.
 *
 *  2. Default to production. `test.api.amadeus.com` serves a fixed sandbox
 *     cache — useful for wiring, useless for real prices. Set AMADEUS_ENV=test
 *     to opt back into it deliberately.
 */

const HOST =
  process.env.AMADEUS_ENV === "test"
    ? "https://test.api.amadeus.com"
    : "https://api.amadeus.com";

let cachedToken: { value: string; exp: number } | null = null;

export function amadeusConfigured(): boolean {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}

async function getToken(): Promise<string | null> {
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(`${HOST}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!res.ok) {
    cachedToken = null;
    return null;
  }
  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    exp: Date.now() + (data.expires_in ?? 1799) * 1000,
  };
  return cachedToken.value;
}

export class AmadeusProvider implements FlightProvider {
  name = "amadeus";

  async search(params: FlightSearchParams): Promise<FlightOffer[]> {
    const token = await getToken();
    if (!token) return simulatedOffers(params, "Amadeus credentials missing or rejected");

    try {
      const qs = new URLSearchParams({
        originLocationCode: params.origin.slice(0, 3).toUpperCase(),
        destinationLocationCode: params.destination.slice(0, 3).toUpperCase(),
        departureDate: params.departureDate.slice(0, 10),
        adults: String(params.passengers ?? 1),
        currencyCode: "USD",
        max: "12",
      });
      if (params.returnDate) qs.set("returnDate", params.returnDate.slice(0, 10));
      if (params.directOnly) qs.set("nonStop", "true");
      if (params.maxPriceUsd) qs.set("maxPrice", String(Math.round(params.maxPriceUsd)));
      if (params.cabin) qs.set("travelClass", cabinToAmadeus(params.cabin));

      const res = await fetch(`${HOST}/v2/shopping/flight-offers?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return simulatedOffers(
          params,
          `Amadeus search failed (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`,
        );
      }

      const data = await res.json();
      const offers = (data.data ?? []) as any[];
      if (!offers.length) {
        return simulatedOffers(params, "Amadeus returned no offers for this route and date");
      }

      const dict = data.dictionaries ?? {};
      return offers.map((o, i) => normalizeOffer(o, params, i, dict));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "network error";
      return simulatedOffers(params, `Amadeus unreachable: ${msg}`);
    }
  }

  /**
   * Confirms a held offer against current inventory. Amadeus requires the full
   * original offer body, so callers pass it through; without it we can only
   * report that the price is unconfirmed.
   */
  async price(offerId: string, rawOffer?: unknown): Promise<FlightOffer | null> {
    const token = await getToken();
    if (!token || !rawOffer) return null;

    try {
      const res = await fetch(
        `${HOST}/v1/shopping/flight-offers/pricing?forceClass=false`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: { type: "flight-offers-pricing", flightOffers: [rawOffer] },
          }),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const priced = data.data?.flightOffers?.[0];
      if (!priced) return null;
      return normalizeOffer(
        priced,
        {
          origin: priced.itineraries?.[0]?.segments?.[0]?.departure?.iataCode ?? "",
          destination: "",
          departureDate: priced.itineraries?.[0]?.segments?.[0]?.departure?.at ?? "",
        },
        0,
        data.dictionaries ?? {},
      );
    } catch {
      return null;
    }
  }

  async status(flightNumber: string, date: string): Promise<FlightStatusUpdate | null> {
    const carrier = flightNumber.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
    const number = flightNumber.replace(/[^0-9]/g, "");
    const token = await getToken();

    if (!token) {
      return simulatedStatus(flightNumber, carrier, date, "Amadeus credentials missing");
    }

    try {
      const qs = new URLSearchParams({
        carrierCode: carrier,
        flightNumber: number,
        scheduledDepartureDate: date.slice(0, 10),
      });
      const res = await fetch(`${HOST}/v2/schedule/flights?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        return simulatedStatus(
          flightNumber,
          carrier,
          date,
          `Amadeus status failed (${res.status})`,
        );
      }

      const data = await res.json();
      const f = data.data?.[0];
      if (!f) {
        return simulatedStatus(flightNumber, carrier, date, "No schedule found for this flight");
      }

      const points = f.flightPoints ?? [];
      const dep = points[0];
      const arr = points[points.length - 1];
      const depTiming = dep?.departure?.timings?.[0]?.value;
      const arrTiming = arr?.arrival?.timings?.[0]?.value;

      return {
        flightNumber,
        airline: carrier,
        scheduledDeparture: depTiming ?? `${date.slice(0, 10)}T00:00:00Z`,
        scheduledArrival: arrTiming,
        terminal: dep?.departure?.terminal?.code,
        gate: dep?.departure?.gate?.mainGate,
        arrivalTerminal: arr?.arrival?.terminal?.code,
        arrivalGate: arr?.arrival?.gate?.mainGate,
        aircraftCode: f.legs?.[0]?.aircraftEquipment?.aircraftType,
        status: "on_time",
        isLive: true,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "network error";
      return simulatedStatus(flightNumber, carrier, date, `Amadeus unreachable: ${msg}`);
    }
  }

  async book(offerId: string): Promise<{ confirmation: string; bookingUrl?: string }> {
    return { confirmation: `AM-${offerId.slice(0, 8).toUpperCase()}` };
  }
}

function cabinToAmadeus(c: NonNullable<FlightSearchParams["cabin"]>): string {
  return c === "premium" ? "PREMIUM_ECONOMY" : c.toUpperCase();
}

function minutesBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60_000)) : 0;
}

/** ISO-8601 duration (PT11H30M) → minutes. */
function parseIsoDuration(d?: string): number | undefined {
  if (!d) return undefined;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(d);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

function normalizeOffer(
  o: any,
  p: FlightSearchParams,
  i: number,
  dict: any,
): FlightOffer {
  const carriers = dict?.carriers ?? {};
  const aircraftDict = dict?.aircraft ?? {};

  const itinerary = o.itineraries?.[0];
  const rawSegments = (itinerary?.segments ?? []) as any[];

  // Cabin and baggage live on travelerPricings, keyed by segment.
  const fareBySegment = new Map<string, any>(
    (o.travelerPricings?.[0]?.fareDetailsBySegment ?? []).map((f: any) => [
      String(f.segmentId),
      f,
    ]),
  );

  const segments: FlightSegment[] = rawSegments.map((s) => {
    const fare = fareBySegment.get(String(s.id));
    const code = s.aircraft?.code;
    return {
      carrierCode: s.carrierCode,
      carrierName: carriers[s.carrierCode],
      flightNumber: `${s.carrierCode}${s.number}`,
      origin: s.departure?.iataCode,
      originTerminal: s.departure?.terminal,
      destination: s.arrival?.iataCode,
      destinationTerminal: s.arrival?.terminal,
      departureIso: s.departure?.at,
      arrivalIso: s.arrival?.at,
      durationMinutes:
        parseIsoDuration(s.duration) ?? minutesBetween(s.departure?.at, s.arrival?.at),
      aircraftCode: code,
      aircraftName: code ? aircraftDict[code] : undefined,
      cabin: fare?.cabin,
      bookingClass: fare?.class,
    };
  });

  const first = segments[0];
  const last = segments[segments.length - 1];
  const firstFare = fareBySegment.get(String(rawSegments[0]?.id));
  const bags = firstFare?.includedCheckedBags;

  const dep = first?.departureIso ?? `${p.departureDate}T00:00:00`;
  const arr = last?.arrivalIso ?? dep;

  return {
    provider: "amadeus",
    offerId: String(o.id ?? `amd-${i}`),
    airline: first?.carrierCode ?? "XX",
    airlineName: first?.carrierName,
    flightNumber: first?.flightNumber ?? "",
    origin: first?.origin ?? p.origin,
    originTerminal: first?.originTerminal,
    destination: last?.destination ?? p.destination,
    destinationTerminal: last?.destinationTerminal,
    departureIso: dep,
    arrivalIso: arr,
    durationMinutes: parseIsoDuration(itinerary?.duration) ?? minutesBetween(dep, arr),
    cabin: (firstFare?.cabin ?? p.cabin ?? "ECONOMY").toString().toLowerCase(),
    bookingClass: firstFare?.class,
    priceUsd: Number(o.price?.grandTotal ?? o.price?.total ?? 0),
    currency: o.price?.currency ?? "USD",
    baggage: bags
      ? {
          carryOnBags: 1,
          checkedBags: Number(bags.quantity ?? 0),
          weightKg: bags.weight ? Number(bags.weight) : undefined,
        }
      : undefined,
    refundable: Boolean(o.pricingOptions?.refundableFare),
    seatMapAvailable: true,
    aircraft: first?.aircraftCode,
    aircraftName: first?.aircraftName,
    stops: Math.max(0, segments.length - 1),
    segments,
    seatsRemaining: o.numberOfBookableSeats
      ? Number(o.numberOfBookableSeats)
      : undefined,
    isLive: true,
  };
}

/**
 * Shaped like a real result so the UI keeps working offline, but flagged so it
 * can never be mistaken for a live fare.
 */
export function simulatedOffers(
  p: FlightSearchParams,
  reason: string,
): FlightOffer[] {
  const date = p.departureDate.slice(0, 10);
  const base = {
    provider: "simulated",
    origin: p.origin,
    destination: p.destination,
    cabin: p.cabin ?? "economy",
    currency: "USD",
    refundable: true,
    seatMapAvailable: false,
    stops: 0,
    isLive: false as const,
    simulatedReason: reason,
  };
  return [
    { ...base, offerId: `SIM-${p.origin}-${p.destination}-A`, airline: "UA", airlineName: "United", flightNumber: "UA101", departureIso: `${date}T06:30:00Z`, arrivalIso: `${date}T09:45:00Z`, durationMinutes: 315, priceUsd: 287 },
    { ...base, offerId: `SIM-${p.origin}-${p.destination}-B`, airline: "DL", airlineName: "Delta", flightNumber: "DL422", departureIso: `${date}T09:15:00Z`, arrivalIso: `${date}T12:40:00Z`, durationMinutes: 325, priceUsd: 342 },
    { ...base, offerId: `SIM-${p.origin}-${p.destination}-C`, airline: "B6", airlineName: "JetBlue", flightNumber: "B681", departureIso: `${date}T12:00:00Z`, arrivalIso: `${date}T15:20:00Z`, durationMinutes: 320, priceUsd: 312 },
  ];
}

function simulatedStatus(
  flightNumber: string,
  carrier: string,
  date: string,
  reason: string,
): FlightStatusUpdate {
  return {
    flightNumber,
    airline: carrier,
    scheduledDeparture: `${date.slice(0, 10)}T10:00:00Z`,
    status: "on_time",
    isLive: false,
    simulatedReason: reason,
  };
}
