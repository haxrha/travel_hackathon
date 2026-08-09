/**
 * Research-agent quotes for proposals.
 *
 * Uses Gemini to invent realistic exact-date flight / hotel / ground prices
 * (hackathon stand-in for live GDS). Always falls back to deterministic
 * route-based quotes so the Proposal tab never shows "Not quoted".
 */

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { DemoTrip } from "@/lib/demo/store";
import type { Attendee, FlightLeg, RoomBlock } from "@/lib/enterprise/program";
import { toAirportCode } from "@/lib/trip/intake";

const geminiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || "";

const QuoteSchema = z.object({
  airline: z.string().describe("Primary marketing carrier, e.g. United Airlines"),
  outboundFlightNumber: z.string().describe("e.g. UA178"),
  returnFlightNumber: z.string().describe("e.g. UA179"),
  roundTripFareUsd: z
    .number()
    .describe("Economy round-trip fare per traveler in USD, realistic for the route/dates"),
  hotelName: z.string().describe("Real-sounding 4★ hotel in the destination city center"),
  hotelAddress: z.string(),
  nightlyRateUsd: z.number().describe("USD per room per night including taxes estimate"),
  groundTransferUsd: z
    .number()
    .describe("Total group airport↔hotel rideshare/transfer quote in USD"),
  notes: z.string().optional(),
});

export type ResearchQuotes = z.infer<typeof QuoteSchema> & {
  source: "gemini" | "synthetic";
};

function ensureGeminiEnv() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GOOGLE_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_API_KEY;
  }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function nightsBetween(start: Date | null, end: Date | null): number {
  if (!start || !end) return 3;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function destAirport(trip: DemoTrip): string {
  return (
    trip.arrivalAirport ??
    toAirportCode(trip.destination) ??
    trip.destination.slice(0, 3).toUpperCase()
  );
}

function party(trip: DemoTrip): Attendee[] {
  if (trip.coordination?.travelers?.length) return trip.coordination.travelers;
  return [
    {
      id: `solo-${trip.id}`,
      name: "Primary traveler",
      email: "traveler@wayport.demo",
      department: "Unassigned",
      title: "Traveler",
      originAirport: trip.originAirport ?? toAirportCode(trip.origin ?? "") ?? "SFO",
      homeCity: trip.origin ?? undefined,
      rsvp: "ACCEPTED",
      travelStatus: "OPTIONS_READY",
    },
  ];
}

/** Deterministic but realistic fares when Gemini is down / slow. */
export function syntheticQuotes(trip: DemoTrip): ResearchQuotes {
  const origin =
    trip.originAirport ?? toAirportCode(trip.origin ?? "") ?? "SFO";
  const dest = destAirport(trip);
  const h = hashStr(`${origin}-${dest}-${iso(trip.startDate)}`);
  const longHaul = !["LIS", "MAD", "BCN", "CDG", "LHR", "AMS", "FRA"].includes(dest)
    ? 1.15
    : origin === "SFO" || origin === "JFK" || origin === "LAX"
      ? 1.35
      : 1;
  const fare = Math.round((780 + (h % 420)) * longHaul);
  const nightly = Math.round(165 + (h % 90));
  const city = trip.destination.split(",")[0]?.trim() || trip.destination;
  const hotels = [
    `${city} City Center Hotel`,
    `Hotel Avenida ${city}`,
    `The ${city} Palace`,
    `${city} Riverside Inn`,
  ];
  const carriers = ["United Airlines", "Lufthansa", "Air Portugal", "Delta Air Lines", "British Airways"];
  const carrier = carriers[h % carriers.length]!;
  const code = carrier === "United Airlines" ? "UA"
    : carrier === "Lufthansa" ? "LH"
    : carrier === "Air Portugal" ? "TP"
    : carrier === "Delta Air Lines" ? "DL"
    : "BA";
  const travelers = Math.max(1, party(trip).length);
  return {
    airline: carrier,
    outboundFlightNumber: `${code}${100 + (h % 800)}`,
    returnFlightNumber: `${code}${200 + (h % 700)}`,
    roundTripFareUsd: fare,
    hotelName: hotels[h % hotels.length]!,
    hotelAddress: `City center, ${trip.destination}`,
    nightlyRateUsd: nightly,
    groundTransferUsd: Math.round(42 + travelers * 18 + (h % 25)),
    notes: "Synthetic research quote (Gemini unavailable).",
    source: "synthetic",
  };
}

function iso(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

async function geminiQuotes(trip: DemoTrip): Promise<ResearchQuotes | null> {
  if (!geminiKey) return null;
  ensureGeminiEnv();
  const travelers = party(trip);
  const origins = [...new Set(travelers.map((t) => t.originAirport))].join(", ");
  try {
    const { object } = await generateObject({
      model: google("gemini-flash-latest"),
      schema: QuoteSchema,
      abortSignal: AbortSignal.timeout(14_000),
      prompt: `You are WAYPORT's flight/hotel research agent. Produce realistic exact-date live quotes for a corporate trip (hackathon demo — invent plausible published fares / hotel rates, do not say unavailable).

Trip: ${trip.title}
Destination: ${trip.destination} (${destAirport(trip)})
Dates: ${iso(trip.startDate)} → ${iso(trip.endDate ?? trip.startDate)} (${nightsBetween(trip.startDate, trip.endDate ?? trip.startDate)} nights)
Origins: ${origins || trip.origin || "SFO"}
Travelers (${travelers.length}): ${travelers.map((t) => `${t.name} from ${t.originAirport}`).join("; ")}
Budget: $${trip.budgets[0]?.totalBudget ?? "unspecified"}

Rules:
- roundTripFareUsd = economy round-trip per person for the primary origin→destination (typical published fare for those dates).
- Prefer a real-sounding 4-star city-center hotel name for ${trip.destination}.
- groundTransferUsd = total for the whole group (airport transfers both ways).
- Flight numbers must look real (airline code + digits).
- Never return zero or null prices.`,
    });
    return { ...object, source: "gemini" };
  } catch (e) {
    console.warn("[quote-research] Gemini failed, using synthetic", e);
    return null;
  }
}

function mkLeg(
  opts: {
    flightNo: string;
    carrier: string;
    origin: string;
    destination: string;
    depart: Date;
    hours: number;
    priceUsd: number;
  },
): FlightLeg {
  const arrive = new Date(opts.depart.getTime() + opts.hours * 3600_000);
  return {
    flightNo: opts.flightNo,
    carrier: opts.carrier,
    origin: opts.origin,
    destination: opts.destination,
    depart: opts.depart,
    arrive,
    cabin: "ECONOMY",
    priceUsd: opts.priceUsd,
    bookedDaysAhead: 45,
    aircraftName: "A321neo",
    confirmationCode: undefined,
  };
}

/**
 * Mutates the DemoTrip with quoted flights, hotel room block, and ground
 * transfer so buildTripProposalDocument emits priced ProposalMoney.
 */
export async function enrichTripWithLiveQuotes(
  trip: DemoTrip,
): Promise<ResearchQuotes> {
  const quotes = (await geminiQuotes(trip)) ?? syntheticQuotes(trip);
  applyQuotesToTrip(trip, quotes);
  return quotes;
}

/** Sync apply — used by tests / when Gemini result already known. */
export function applyQuotesToTrip(trip: DemoTrip, quotes: ResearchQuotes) {
  const travelers = party(trip);
  const dest = destAirport(trip);
  const nights = nightsBetween(trip.startDate, trip.endDate ?? trip.startDate);
  const start = trip.startDate ? new Date(trip.startDate) : new Date();
  const end = trip.endDate ? new Date(trip.endDate) : new Date(start.getTime() + nights * 86_400_000);

  const halfFare = Math.round(quotes.roundTripFareUsd / 2);

  // Ensure coordination exists when we have a multi-person party or want hotel block.
  if (!trip.coordination && travelers.length) {
    // Solo trips keep travelers only on the synthetic party(); still stamp meta.
  }

  if (trip.coordination) {
    for (const a of trip.coordination.travelers) {
      const origin = a.originAirport || trip.originAirport || "SFO";
      const outDepart = new Date(start);
      outDepart.setUTCHours(10, 15, 0, 0);
      const retDepart = new Date(end);
      retDepart.setUTCHours(14, 40, 0, 0);
      // inbound = arriving at destination; outbound = return home (legacy naming).
      a.inbound = mkLeg({
        flightNo: quotes.outboundFlightNumber,
        carrier: quotes.airline,
        origin,
        destination: dest,
        depart: outDepart,
        hours: origin === "SFO" || origin === "LAX" ? 11.5 : 8.5,
        priceUsd: halfFare,
      });
      a.outbound = mkLeg({
        flightNo: quotes.returnFlightNumber,
        carrier: quotes.airline,
        origin: dest,
        destination: origin,
        depart: retDepart,
        hours: origin === "SFO" || origin === "LAX" ? 12 : 9,
        priceUsd: halfFare,
      });
      a.nightlyRateUsd = quotes.nightlyRateUsd;
      a.nights = nights;
      a.travelStatus = a.travelStatus === "NOT_STARTED" ? "OPTIONS_READY" : a.travelStatus;
    }

    const blockId = trip.coordination.roomBlocks[0]?.id ?? `rb-${trip.id.slice(0, 8)}`;
    const block: RoomBlock = {
      id: blockId,
      hotelName: quotes.hotelName,
      address: quotes.hotelAddress,
      nightlyRateUsd: quotes.nightlyRateUsd,
      isContractedRate: false,
      roomsHeld: Math.max(travelers.length, 1),
      cutoffDate: new Date(start.getTime() - 7 * 86_400_000),
      walkMinutesToVenue: 8,
    };
    trip.coordination.roomBlocks = [block];
    for (const a of trip.coordination.travelers) {
      a.roomBlockId = blockId;
    }
    // Force proposal rebuild with new quotes.
    trip.coordination.proposal = undefined;
  }

  // Stamp itinerary HOTEL / FLIGHT / TRANSFER items with prices for Map OS.
  for (const item of trip.items) {
    if (item.kind === "HOTEL") {
      item.title = `Check in — ${quotes.hotelName}`;
      item.location = quotes.hotelAddress;
      item.payload = {
        ...(item.payload ?? {}),
        priceUsd: quotes.nightlyRateUsd * nights,
        nightlyRateUsd: quotes.nightlyRateUsd,
        quoteSource: quotes.source,
      };
    }
    if (item.kind === "FLIGHT") {
      const isReturn = /return/i.test(item.title);
      item.payload = {
        ...(item.payload ?? {}),
        priceUsd: halfFare,
        carrier: quotes.airline,
        flightNo: isReturn ? quotes.returnFlightNumber : quotes.outboundFlightNumber,
        quoteSource: quotes.source,
      };
      if (!/return/i.test(item.title) && !item.title.includes(quotes.outboundFlightNumber)) {
        item.title = `${quotes.airline} ${quotes.outboundFlightNumber}`;
      }
    }
    if (item.kind === "TRANSFER" || item.kind === "TRANSIT") {
      item.payload = {
        ...(item.payload ?? {}),
        priceUsd: quotes.groundTransferUsd,
        quoteSource: quotes.source,
      };
    }
  }

  trip.meta = {
    ...(trip.meta ?? {}),
    researchQuotes: quotes,
    groundQuoteUsd: quotes.groundTransferUsd,
    quotesEnrichedAt: new Date().toISOString(),
  };
}
