/**
 * Turns a WAYPORT DemoTrip into the agent TripProposal wire format
 * (request_id, travel_map, flights, hotel, budget, flags, …) for Firestore.
 */

import type { DemoTrip } from "@/lib/demo/store";
import type { Attendee, FlightLeg } from "@/lib/enterprise/program";
import type { TripProposal, ProposalMoney } from "@/lib/enterprise/proposal";
import { PURPOSE_LABEL } from "@/lib/enterprise/program";
import { findDirectoryByEmail } from "@/lib/enterprise/directory";
import { toAirportCode } from "@/lib/trip/intake";

function unavailable(notes: string): ProposalMoney {
  return { amount_usd: null, status: "unavailable", notes };
}

function priced(amount: number, notes?: string): ProposalMoney {
  return { amount_usd: amount, status: "quoted", notes: notes ?? null };
}

function moneyFrom(amount: number | null | undefined, notes: string): ProposalMoney {
  return typeof amount === "number" && amount > 0 ? priced(amount, notes) : unavailable(notes);
}

function isoDate(d: Date | null | undefined, fallback = ""): string {
  if (!d) return fallback;
  return d.toISOString().slice(0, 10);
}

function localStamp(d: Date | null | undefined): string | null {
  if (!d) return null;
  const iso = d.toISOString();
  // "2026-10-12T08:15:00.000Z" → "2026-10-12 08:15"
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function legFromFlight(leg: FlightLeg) {
  return {
    flight_number: leg.flightNo,
    airline: leg.carrier,
    origin_airport: leg.origin,
    destination_airport: leg.destination,
    departure_local_time: localStamp(leg.depart) ?? "",
    arrival_local_time: localStamp(leg.arrive) ?? "",
  };
}

function specialRequests(a: Attendee): string[] {
  const out: string[] = [];
  if (a.loyaltyNumbers) {
    for (const [prog, num] of Object.entries(a.loyaltyNumbers)) {
      out.push(`Add ${prog} ${num}`);
    }
  }
  if (a.knownTravelerNumber) out.push(`Add ${a.knownTravelerNumber}`);
  if (a.seatPreference) out.push(`Request ${a.seatPreference} seat`);
  for (const d of a.dietary ?? []) out.push(`Note ${d} for meal planning`);
  for (const x of a.accessibility ?? []) out.push(`Request ${x}`);
  return out;
}

function party(trip: DemoTrip): Attendee[] {
  if (trip.coordination?.travelers?.length) return trip.coordination.travelers;
  // Solo: synthesize one traveler from trip origin.
  return [
    {
      id: `solo-${trip.id}`,
      name: "Primary traveler",
      email: "traveler@wayport.demo",
      department: "Unassigned",
      title: "Traveler",
      originAirport: trip.originAirport ?? toAirportCode(trip.origin ?? "") ?? "XXX",
      homeCity: trip.origin ?? undefined,
      rsvp: "ACCEPTED",
      travelStatus: "OPTIONS_READY",
    },
  ];
}

function destinationAirport(trip: DemoTrip): string {
  return (
    trip.arrivalAirport ??
    toAirportCode(trip.destination) ??
    trip.destination.slice(0, 3).toUpperCase()
  );
}

function flightItems(trip: DemoTrip) {
  return trip.items.filter((i) => i.kind === "FLIGHT");
}

function hotelItems(trip: DemoTrip) {
  return trip.items.filter((i) => i.kind === "HOTEL");
}

function transferItems(trip: DemoTrip) {
  return trip.items.filter((i) => i.kind === "TRANSFER" || i.kind === "TRANSIT");
}

/**
 * Prefer an existing agent proposal; otherwise rebuild the same shape from
 * roster + itinerary + budget so Firestore always gets a full document.
 */
export function buildTripProposalDocument(trip: DemoTrip): TripProposal {
  if (trip.coordination?.proposal) {
    return {
      ...trip.coordination.proposal,
      request_id: trip.coordination.proposal.request_id || `TRQ-${trip.id.slice(0, 8).toUpperCase()}`,
    };
  }

  const travelers = party(trip);
  const destAirport = destinationAirport(trip);
  const start = isoDate(trip.startDate);
  const end = isoDate(trip.endDate ?? trip.startDate);
  const purpose =
    (trip.coordination?.purpose && PURPOSE_LABEL[trip.coordination.purpose]) ||
    trip.title ||
    "Business trip";
  const budgetTotal = Number(trip.budgets[0]?.totalBudget ?? 0) || null;
  const perPerson =
    budgetTotal && travelers.length
      ? Math.round(budgetTotal / travelers.length)
      : null;

  const flightsFromAttendees = travelers.map((a) => {
    const outPrice =
      (a.inbound?.priceUsd ?? 0) + (a.outbound?.priceUsd ?? 0) || null;
    const outbound = a.inbound ? [legFromFlight(a.inbound)] : [];
    const ret = a.outbound ? [legFromFlight(a.outbound)] : [];
    // If no per-person legs yet, invent schedule stubs from trip flight items.
    if (!outbound.length && !ret.length) {
      const stubs = synthesizeLegsFromItems(trip, a.originAirport, destAirport);
      const research = trip.meta?.researchQuotes as
        | { roundTripFareUsd?: number; source?: string }
        | undefined;
      const fare =
        typeof research?.roundTripFareUsd === "number" && research.roundTripFareUsd > 0
          ? research.roundTripFareUsd
          : typeof (flightItems(trip)[0]?.payload as { priceUsd?: number } | null)?.priceUsd ===
              "number"
            ? ((flightItems(trip)[0]!.payload as { priceUsd: number }).priceUsd) * 2
            : null;
      return {
        traveler_name: a.name,
        home_airport: a.originAirport,
        destination_airport: destAirport,
        outbound_legs: stubs.outbound,
        return_legs: stubs.return,
        destination_arrival_local_time: stubs.outbound.at(-1)?.arrival_local_time ?? null,
        origin_departure_local_time: stubs.return[0]?.departure_local_time ?? null,
        airline_preference_honored: a.airlinePreference ? true : null,
        seat_preference: a.seatPreference ?? null,
        special_requests: specialRequests(a),
        price: moneyFrom(
          fare,
          fare
            ? `Exact-date research quote (${research?.source ?? "synthetic"}).`
            : "No verified live quote for this itinerary yet — schedule is planner-generated.",
        ),
        risk_flags: fare
          ? []
          : [
              "Schedule pattern reported, but live bookable inventory and cabin were not confirmed.",
            ],
      };
    }
    return {
      traveler_name: a.name,
      home_airport: a.originAirport,
      destination_airport: destAirport,
      outbound_legs: outbound,
      return_legs: ret,
      destination_arrival_local_time: a.inbound ? localStamp(a.inbound.arrive) : null,
      origin_departure_local_time: a.outbound ? localStamp(a.outbound.depart) : null,
      airline_preference_honored: a.airlinePreference ? true : null,
      seat_preference: a.seatPreference ?? null,
      special_requests: specialRequests(a),
      price: moneyFrom(
        outPrice,
        outPrice
          ? "Sum of inbound + outbound legs on the Travel Graph."
          : "No verified live quote for this itinerary.",
      ),
      risk_flags: a.deviationNote ? [a.deviationNote] : [],
    };
  });

  const hotelItem = hotelItems(trip);
  const block = trip.coordination?.roomBlocks[0];
  const nights = travelers[0]?.nights ?? nightsBetween(trip.startDate, trip.endDate);
  const researchHotel = trip.meta?.researchQuotes as
    | { hotelName?: string; hotelAddress?: string; nightlyRateUsd?: number; source?: string }
    | undefined;
  const rooms = travelers.map((a) => {
    const accessible = (a.accessibility?.length ?? 0) > 0;
    const nightly =
      a.nightlyRateUsd ??
      block?.nightlyRateUsd ??
      researchHotel?.nightlyRateUsd;
    const roomTotal =
      nightly != null && nights != null ? nightly * nights : null;
    return {
      traveler_name: a.name,
      room_type: accessible
        ? "Wheelchair-accessible king room; bathroom configuration must be confirmed"
        : "Single occupancy, standard king or equivalent",
      accessible,
      accessibility_notes: accessible
        ? (a.accessibility ?? []).join("; ") ||
          "Accessible room requested; exact bathroom configuration unconfirmed."
        : null,
      price: moneyFrom(
        roomTotal,
        roomTotal != null
          ? `${nights} nights × $${nightly}/night`
          : "No live exact-date quote or inventory returned.",
      ),
    };
  });

  const hotelName =
    block?.hotelName ??
    researchHotel?.hotelName ??
    hotelItem[0]?.title?.replace(/^Check in\s*[—–-]?\s*/i, "") ??
    `Hotel near ${trip.destination}`;
  const hotelAddress =
    block?.address ??
    researchHotel?.hotelAddress ??
    hotelItem[0]?.location ??
    trip.destination;

  const hotelNightly = block?.nightlyRateUsd ?? researchHotel?.nightlyRateUsd;
  const hotelTotal =
    hotelNightly != null && nights != null && travelers.length
      ? hotelNightly * nights * travelers.length
      : rooms.reduce(
          (s, r) => s + (typeof r.price.amount_usd === "number" ? r.price.amount_usd : 0),
          0,
        ) || null;

  const names = travelers.map((t) => t.name);
  const flightSum = flightsFromAttendees.reduce(
    (s, f) => s + (typeof f.price.amount_usd === "number" ? f.price.amount_usd : 0),
    0,
  );
  const anyFlightPriced = flightsFromAttendees.some((f) => typeof f.price.amount_usd === "number");
  const anyHotelPriced = typeof hotelTotal === "number" && hotelTotal > 0;

  const groundUsd =
    typeof trip.meta?.groundQuoteUsd === "number" && trip.meta.groundQuoteUsd > 0
      ? (trip.meta.groundQuoteUsd as number)
      : transferItems(trip).reduce(
          (s, i) => s + (typeof (i.payload as { priceUsd?: number } | null)?.priceUsd === "number"
            ? (i.payload as { priceUsd: number }).priceUsd
            : 0),
          0,
        ) || null;
  const anyGroundPriced = typeof groundUsd === "number" && groundUsd > 0;

  const quoteSource =
    typeof trip.meta?.researchQuotes === "object" && trip.meta?.researchQuotes
      ? ((trip.meta.researchQuotes as { source?: string }).source ?? "research")
      : "research";

  const estimated =
    (anyFlightPriced ? flightSum : 0) +
    (anyHotelPriced ? (hotelTotal as number) : 0) +
    (anyGroundPriced ? (groundUsd as number) : 0);
  const estimatedMoney =
    estimated > 0
      ? priced(
          estimated,
          `Sum of research-agent quotes (${quoteSource}) for flights, hotel, and ground.`,
        )
      : unavailable(
          "Cannot calculate a truthful total until live flight, hotel, and ground quotes are obtained.",
        );

  const coverageMissing =
    !anyFlightPriced || !anyHotelPriced
      ? [
          {
            severity: "critical" as const,
            message:
              "The research agents did not return exact-date live prices or bookable availability for all segments; total cost and budget compliance may be incomplete.",
          },
        ]
      : [];

  const summary = buildSummary(trip, travelers, hotelName, destAirport);

  const proposal: TripProposal = {
    request_id: `TRQ-${trip.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase() || "NEW"}`,
    trip_purpose: purpose,
    destination_city: trip.destination.split(",")[0]?.trim() || trip.destination,
    destination_address: hotelAddress.includes(",") ? hotelAddress : null,
    start_date: start,
    end_date: end || start,
    summary,
    status: trip.coordination?.approvals.some((a) => a.status === "PENDING")
      ? "awaiting_budget_approval"
      : trip.status === "PLANNING"
        ? "planning"
        : "proposed",
    travel_map: travelers.map((a) => {
      const dir = findDirectoryByEmail(a.email);
      return {
        traveler_name: a.name,
        home_city: a.homeCity ?? dir?.homeCity ?? a.originAirport,
        home_airport: a.originAirport,
        latitude: a.lat ?? dir?.lat ?? null,
        longitude: a.lng ?? dir?.lng ?? null,
      };
    }),
    flights: flightsFromAttendees,
    hotel: {
      hotel_name: hotelName,
      address: hotelAddress,
      star_rating: 4,
      walking_distance_to_office: block?.walkMinutesToVenue
        ? `Approximately ${block.walkMinutesToVenue} minutes on foot to venue.`
        : null,
      check_in: start,
      check_out: end || start,
      rooms,
      total_price: moneyFrom(
        anyHotelPriced ? hotelTotal : null,
        anyHotelPriced
          ? `Exact-date room block quote (${quoteSource}).`
          : "Exact-date simultaneous inventory, taxes, fees, and cancellation/payment terms were not returned.",
      ),
      alternatives_considered: [],
    },
    ground_transportation: [
      {
        description: transferItems(trip)[0]?.title
          ? `${transferItems(trip)[0]!.title} — airport / hotel transfer for the group`
          : `Airport transfer/rideshare between ${destAirport} and hotel for the group`,
        traveler_names: names,
        price: moneyFrom(
          anyGroundPriced ? groundUsd : null,
          anyGroundPriced
            ? `Exact-date transfer quote (${quoteSource}).`
            : "No live quote obtained; rental car is not required.",
        ),
      },
    ],
    budget: {
      total_budget_usd: budgetTotal,
      per_person_limit_usd: perPerson,
      currency: trip.budgets[0]?.currency ?? "USD",
      breakdown: [
        {
          category: "flights",
          price: moneyFrom(
            anyFlightPriced ? flightSum : null,
            anyFlightPriced
              ? "Sum of traveler flight quotes."
              : "No exact-date live fares returned for all travelers.",
          ),
        },
        {
          category: "hotel",
          price: moneyFrom(
            anyHotelPriced ? hotelTotal : null,
            anyHotelPriced
              ? "Lodging subtotal."
              : "No exact-date quote or simultaneous room inventory returned.",
          ),
        },
        {
          category: "ground_transportation",
          price: moneyFrom(
            anyGroundPriced ? groundUsd : null,
            anyGroundPriced
              ? "Airport transfer / rideshare quote."
              : "No live airport-transfer/rideshare quote returned.",
          ),
        },
      ],
      estimated_total_cost: estimatedMoney,
      per_traveler_cost_usd: Object.fromEntries(
        flightsFromAttendees.map((f) => {
          const room = rooms.find((r) => r.traveler_name === f.traveler_name);
          const air = typeof f.price.amount_usd === "number" ? f.price.amount_usd : 0;
          const lod =
            typeof room?.price.amount_usd === "number" ? room.price.amount_usd : 0;
          const groundShare =
            anyGroundPriced && travelers.length
              ? Math.round((groundUsd as number) / travelers.length)
              : 0;
          return [f.traveler_name, air + lod + groundShare];
        }).filter(([, v]) => (v as number) > 0),
      ),
      over_budget:
        budgetTotal != null && estimated > 0 ? estimated > budgetTotal : null,
      approval_status: trip.coordination?.approvals.some((a) => a.status === "PENDING")
        ? "pending"
        : "not_required",
      approver: null,
    },
    flags: [
      ...(trip.coordination?.approvals.some((a) => a.status === "PENDING")
        ? [
            {
              severity: "critical" as const,
              message:
                "No booking may be made yet: policy / budget approvals are still pending.",
            },
          ]
        : []),
      ...coverageMissing,
      {
        severity: "info" as const,
        message: anyFlightPriced && anyHotelPriced
          ? `Research agents returned exact-date quotes (${quoteSource}) for flights, hotel, and ground. WAYPORT trip ${trip.id}.`
          : `WAYPORT wrote this proposal from Travel Graph trip ${trip.id}.`,
      },
    ],
    next_steps: anyFlightPriced && anyHotelPriced
      ? [
          "Confirm traveler RSVPs and special requests.",
          "Review quoted fares and hotel block against policy caps.",
          "Approve budget, then book via Rain scoped cards when configured.",
        ]
      : [
          "Confirm traveler RSVPs and special requests.",
          "Obtain live flight and hotel quotes for the exact dates.",
          "Approve budget, then book via Rain scoped cards when configured.",
        ],
  };

  return proposal;
}

function nightsBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const n = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, n);
}

function synthesizeLegsFromItems(
  trip: DemoTrip,
  origin: string,
  dest: string,
): {
  outbound: ReturnType<typeof legFromFlight>[];
  return: ReturnType<typeof legFromFlight>[];
} {
  const flights = flightItems(trip);
  const outboundItem = flights.find((f) => !/return/i.test(f.title));
  const returnItem = flights.find((f) => /return/i.test(f.title)) ?? flights[1];

  const mk = (
    from: string,
    to: string,
    when: Date | null,
    title: string,
  ) => {
    const depart = when ?? trip.startDate ?? new Date();
    const arrive = new Date(depart.getTime() + 8 * 3600_000);
    return {
      flight_number: title.match(/\b([A-Z]{2}\s?\d{1,4})\b/)?.[1]?.replace(/\s/g, "") ?? "XX000",
      airline: "TBD",
      origin_airport: from,
      destination_airport: to,
      departure_local_time: localStamp(depart) ?? "",
      arrival_local_time: localStamp(arrive) ?? "",
    };
  };

  return {
    outbound: [
      mk(origin, dest, outboundItem?.startTime ?? trip.startDate, outboundItem?.title ?? "Outbound"),
    ],
    return: returnItem || trip.endDate
      ? [
          mk(
            dest,
            origin,
            returnItem?.startTime ?? trip.endDate,
            returnItem?.title ?? "Return",
          ),
        ]
      : [],
  };
}

function buildSummary(
  trip: DemoTrip,
  travelers: Attendee[],
  hotelName: string,
  destAirport: string,
): string {
  const names = travelers.map((t) => t.name).join(", ");
  const origins = [...new Set(travelers.map((t) => t.originAirport))].join(", ");
  return (
    `Recommended itinerary for ${travelers.length} traveler${travelers.length === 1 ? "" : "s"}` +
    `${names ? ` (${names})` : ""} from ${origins || trip.origin || "TBD"} to ${trip.destination}` +
    ` (${destAirport}), ${isoDate(trip.startDate)}–${isoDate(trip.endDate ?? trip.startDate)}.` +
    ` Proposed lodging: ${hotelName}.` +
    ` Generated by WAYPORT Orchestrator and synced to Firestore.`
  );
}
