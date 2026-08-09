/**
 * Seeds the demo group trip — an engineering offsite in Lisbon with 12 people
 * converging from 6 cities.
 *
 * Deliberately stocked with the situations an organizer actually has to
 * resolve: policy breaches, a cabin upgrade, a late booker, a deviation
 * request, non-responders, and a room block about to release.
 */

import type { DemoTrip, DemoItem, TripCoordination } from "@/lib/demo/store";
import {
  buildApprovals,
  STANDARD_TIER,
  type Attendee,
  type CabinClass,
  type FlightLeg,
  type RoomBlock,
} from "./program";
import { listDirectory, toAttendee } from "./directory";
import { parseProposal, parseLocal, type TripProposal } from "./proposal";
import { SF_PROPOSAL_RAW } from "./sf-proposal";

/** Midnight-UTC anchored so server and client render identical dates. */
function baseDay(offsetDays: number, hour = 0, minute = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function leg(
  flightNo: string,
  carrier: string,
  origin: string,
  destination: string,
  departDay: number,
  departHour: number,
  durationHours: number,
  priceUsd: number,
  cabin: CabinClass = "ECONOMY",
  bookedDaysAhead = 26,
  originTerminal?: string,
  destinationTerminal?: string,
): FlightLeg {
  const depart = baseDay(departDay, departHour, 0);
  return {
    flightNo,
    carrier,
    origin,
    destination,
    depart,
    arrive: new Date(depart.getTime() + durationHours * 3_600_000),
    cabin,
    priceUsd,
    bookedDaysAhead,
    originTerminal,
    destinationTerminal,
  };
}

const START = 24;
const END = 28;
const NIGHTS = 4;

export function buildLisbonTrip(userId: string): DemoTrip {
  const blockMain: RoomBlock = {
    id: "block-tivoli",
    hotelName: "Tivoli Avenida Liberdade",
    address: "Av. da Liberdade 185, 1269-050 Lisbon, Portugal",
    nightlyRateUsd: 240,
    isContractedRate: true,
    roomsHeld: 10,
    cutoffDate: baseDay(6, 12),
    walkMinutesToVenue: 7,
  };

  const blockOverflow: RoomBlock = {
    id: "block-locke",
    hotelName: "Locke de Santa Joana",
    address: "R. de Santa Marta 48, 1150-297 Lisbon, Portugal",
    nightlyRateUsd: 205,
    isContractedRate: false,
    roomsHeld: 4,
    cutoffDate: baseDay(11, 12),
    walkMinutesToVenue: 14,
  };

  const A = (
    name: string,
    email: string,
    department: string,
    title: string,
    originAirport: string,
    rest: Partial<Attendee>,
  ): Attendee => ({
    id: `att-${email.split("@")[0]}`,
    name,
    email,
    department,
    title,
    originAirport,
    rsvp: "ACCEPTED",
    travelStatus: "BOOKED",
    roomBlockId: blockMain.id,
    nightlyRateUsd: blockMain.nightlyRateUsd,
    nights: NIGHTS,
    ...rest,
  });

  const travelers: Attendee[] = [
    A("Dana Whitfield", "dana@northwind.co", "Engineering", "VP Engineering", "SFO", {
      inbound: leg("UA 970", "United", "SFO", "LIS", START - 1, 16, 11.5, 1180, "BUSINESS", 31, "3", "1"),
      outbound: leg("UA 971", "United", "LIS", "SFO", END, 11, 12, 1240, "BUSINESS", 31, "1", "3"),
      nightlyRateUsd: 390,
    }),
    A("Marcus Chen", "marcus@northwind.co", "Engineering", "Staff Engineer", "SFO", {
      inbound: leg("UA 970", "United", "SFO", "LIS", START - 1, 16, 11.5, 640, "ECONOMY", 30, "3", "1"),
      outbound: leg("UA 971", "United", "LIS", "SFO", END, 11, 12, 610, "ECONOMY", 30, "1", "3"),
    }),
    A("Priya Raghunathan", "priya@northwind.co", "Engineering", "Engineering Manager", "JFK", {
      inbound: leg("TP 208", "TAP Air Portugal", "JFK", "LIS", START - 1, 21, 6.8, 495, "ECONOMY", 28, "5", "1"),
      outbound: leg("TP 209", "TAP Air Portugal", "LIS", "JFK", END, 10, 8, 470, "ECONOMY", 28, "1", "5"),
    }),
    A("Tomás Oliveira", "tomas@northwind.co", "Design", "Principal Designer", "JFK", {
      inbound: leg("TP 208", "TAP Air Portugal", "JFK", "LIS", START - 1, 21, 6.8, 510, "ECONOMY", 27, "5", "1"),
      outbound: leg("TP 209", "TAP Air Portugal", "LIS", "JFK", END, 10, 8, 505, "ECONOMY", 27, "1", "5"),
      dietary: ["vegetarian"],
    }),
    A("Sarah Lindqvist", "sarah@northwind.co", "Product", "Group PM", "LHR", {
      inbound: leg("BA 502", "British Airways", "LHR", "LIS", START, 8, 2.7, 210, "ECONOMY", 25, "5", "1"),
      outbound: leg("BA 503", "British Airways", "LIS", "LHR", END, 18, 2.7, 195, "ECONOMY", 25, "1", "5"),
    }),
    A("Owen Baptiste", "owen@northwind.co", "Product", "PM", "LHR", {
      inbound: leg("BA 502", "British Airways", "LHR", "LIS", START, 8, 2.7, 210, "ECONOMY", 25, "5", "1"),
      outbound: leg("BA 503", "British Airways", "LIS", "LHR", END, 18, 2.7, 195, "ECONOMY", 25, "1", "5"),
      accessibility: ["step-free room"],
    }),
    // Booked late; the fare spiked past the IC cap.
    A("Nadia Haddad", "nadia@northwind.co", "Engineering", "Senior Engineer", "ORD", {
      inbound: leg("LH 431", "Lufthansa", "ORD", "LIS", START, 9, 12.5, 880, "ECONOMY", 9, "1", "1"),
      outbound: leg("LH 432", "Lufthansa", "LIS", "ORD", END, 12, 13, 810, "ECONOMY", 9, "1", "1"),
      travelStatus: "PENDING_APPROVAL",
    }),
    // Extending into the weekend at personal cost.
    A("Ben Arkwright", "ben@northwind.co", "Engineering", "Engineer", "SEA", {
      inbound: leg("DL 262", "Delta", "SEA", "LIS", START - 1, 14, 13, 720, "ECONOMY", 22, "A", "1"),
      outbound: leg("DL 263", "Delta", "LIS", "SEA", END + 2, 13, 14, 690, "ECONOMY", 22, "1", "A"),
      travelStatus: "PENDING_APPROVAL",
      deviationNote: "Extending 2 nights personally — return leg moved to Sunday",
    }),
    // Overflow hotel, over the nightly cap because the main block filled.
    A("Grace Mbeki", "grace@northwind.co", "Data", "Analytics Lead", "AMS", {
      inbound: leg("KL 1693", "KLM", "AMS", "LIS", START, 10, 3.2, 265, "ECONOMY", 24, "2", "1"),
      outbound: leg("KL 1694", "KLM", "LIS", "AMS", END, 16, 3.2, 250, "ECONOMY", 24, "1", "2"),
      roomBlockId: blockOverflow.id,
      nightlyRateUsd: 295,
      travelStatus: "PENDING_APPROVAL",
    }),
    A("Felix Toure", "felix@northwind.co", "Data", "Data Engineer", "AMS", {
      inbound: leg("KL 1693", "KLM", "AMS", "LIS", START, 10, 3.2, 265, "ECONOMY", 24, "2", "1"),
      outbound: leg("KL 1694", "KLM", "LIS", "AMS", END, 16, 3.2, 250, "ECONOMY", 24, "1", "2"),
      roomBlockId: blockOverflow.id,
      nightlyRateUsd: blockOverflow.nightlyRateUsd,
      travelStatus: "OPTIONS_READY",
    }),
    // Not responded — blocking the room block.
    A("Isabel Moreau", "isabel@northwind.co", "Design", "Designer", "CDG", {
      rsvp: "INVITED",
      travelStatus: "NOT_STARTED",
      roomBlockId: undefined,
      nightlyRateUsd: undefined,
      nights: undefined,
    }),
    A("Ravi Anand", "ravi@northwind.co", "Engineering", "Engineer", "BLR", {
      rsvp: "TENTATIVE",
      travelStatus: "OPTIONS_READY",
      inbound: leg("EK 569", "Emirates", "BLR", "LIS", START - 1, 4, 16, 940, "ECONOMY", 20, "1", "1"),
      outbound: leg("EK 570", "Emirates", "LIS", "BLR", END, 9, 17, 910, "ECONOMY", 20, "1", "1"),
    }),
  ];

  const coordination: TripCoordination = {
    purpose: "OFFSITE",
    costCenter: "ENG-1042",
    policyTier: STANDARD_TIER,
    travelers,
    roomBlocks: [blockMain, blockOverflow],
    approvals: buildApprovals(travelers, STANDARD_TIER),
    agenda: [
      {
        id: "ag-1",
        title: "Welcome dinner — Time Out Market",
        start: baseDay(START, 19, 30),
        end: baseDay(START, 22, 0),
        location: "Time Out Market, Cais do Sodré, Lisbon",
        attendeeIds: [],
        mandatory: false,
      },
      {
        id: "ag-2",
        title: "Day 1 — Roadmap working session",
        start: baseDay(START + 1, 9, 0),
        end: baseDay(START + 1, 17, 0),
        location: "LX Factory, Room 4, Alcântara",
        attendeeIds: [],
        mandatory: true,
      },
      {
        id: "ag-3",
        title: "Architecture deep dive",
        start: baseDay(START + 2, 9, 30),
        end: baseDay(START + 2, 13, 0),
        location: "LX Factory, Room 4, Alcântara",
        attendeeIds: travelers.filter((a) => a.department === "Engineering").map((a) => a.id),
        mandatory: true,
      },
      {
        id: "ag-4",
        title: "Team activity — Sintra day trip",
        start: baseDay(START + 3, 10, 0),
        end: baseDay(START + 3, 18, 0),
        location: "Sintra, Portugal",
        attendeeIds: [],
        mandatory: false,
      },
    ],
  };

  // Shared agenda entries double as itinerary items so the timeline is populated.
  const items: DemoItem[] = coordination.agenda.map((e) => ({
    id: `item-${e.id}`,
    tripId: "trip-lisbon-offsite",
    kind: e.mandatory ? "EVENT" : "ACTIVITY",
    title: e.title,
    status: "CONFIRMED",
    startTime: e.start,
    endTime: e.end,
    location: e.location,
    payload: { attendeeCount: e.attendeeIds.length || travelers.length },
    createdAt: new Date(),
  }));

  const budget = 32_000;
  return {
    id: "trip-lisbon-offsite",
    userId,
    title: "Engineering Offsite — Lisbon",
    destination: "Lisbon, Portugal",
    origin: "Multiple origins",
    originAirport: null,
    arrivalAirport: "LIS",
    status: "PLANNING",
    mode: "PLANNING",
    startDate: baseDay(START),
    endDate: baseDay(END),
    createdAt: new Date(),
    budgets: [{ totalBudget: budget, actual: 0, remaining: budget, currency: "USD" }],
    items,
    alerts: [],
    edges: [],
    bookings: [],
    coordination,
  };
}

/**
 * Builds the San Francisco onsite from the agent proposal.
 *
 * Attendees are resolved out of the directory by name so the trip carries their
 * standing details (loyalty numbers, dietary needs, home coordinates) rather
 * than only what the proposal happened to restate. Flight legs come from the
 * proposal itself, so the Team tab and the Proposal tab describe one schedule.
 */
export function buildSanFranciscoTrip(userId: string): DemoTrip {
  const parsed = parseProposal(SF_PROPOSAL_RAW);
  if (!parsed.ok) {
    // A malformed demo fixture should fail loudly at boot, not render blank.
    throw new Error(`SF proposal fixture is invalid: ${parsed.errors.join("; ")}`);
  }
  const proposal: TripProposal = parsed.proposal;

  const byName = new Map(listDirectory().map((d) => [d.name, d]));

  const travelers: Attendee[] = proposal.flights.map((plan) => {
    const dir = byName.get(plan.traveler_name);
    const base: Attendee = dir
      ? toAttendee(dir)
      : {
          id: `att-${plan.traveler_name.toLowerCase().replace(/\s+/g, "-")}`,
          name: plan.traveler_name,
          email: `${plan.traveler_name.split(" ")[0].toLowerCase()}@northwind.co`,
          department: "Unassigned",
          title: "Traveler",
          originAirport: plan.home_airport,
          rsvp: "ACCEPTED",
          travelStatus: "OPTIONS_READY",
        };

    const room = proposal.hotel?.rooms.find((r) => r.traveler_name === plan.traveler_name);

    return {
      ...base,
      rsvp: "ACCEPTED",
      // Nothing is priced or ticketed yet — the proposal is the whole point.
      travelStatus: "OPTIONS_READY",
      inbound: legFromProposal(plan.outbound_legs),
      outbound: legFromProposal(plan.return_legs),
      roomBlockId: room ? "block-clancy" : undefined,
      // Rate deliberately unset — no quote returned for these dates.
      nightlyRateUsd: undefined,
      nights: 4,
      seatPreference: (plan.seat_preference as Attendee["seatPreference"]) ?? base.seatPreference,
      deviationNote: room?.accessibility_notes ?? undefined,
    };
  });

  const block: RoomBlock = {
    id: "block-clancy",
    hotelName: proposal.hotel?.hotel_name ?? "TBD",
    address: proposal.hotel?.address ?? "",
    // No live quote came back; undefined is "not quoted", not free.
    nightlyRateUsd: undefined,
    isContractedRate: false,
    roomsHeld: proposal.hotel?.rooms.length ?? 0,
    cutoffDate: startOf(proposal.start_date, -7),
    walkMinutesToVenue: 9,
  };

  const coordination: TripCoordination = {
    purpose: "OFFSITE",
    costCenter: "ENG-2210",
    policyTier: STANDARD_TIER,
    travelers,
    roomBlocks: [block],
    approvals: buildApprovals(travelers, STANDARD_TIER),
    agenda: [],
    proposal,
  };

  /**
   * The trip map shows the shared on-the-ground plan, not every traveler's
   * flight legs. Fifteen per-person segments across three countries told the
   * organizer nothing about San Francisco — individual routings live on the
   * Team and Proposal tabs, which is where they're actually useful.
   */
  const arrival = parseLocal(proposal.flights[0]?.destination_arrival_local_time) ?? startOf(proposal.start_date);
  const day = (offset: number, hour: number, minute = 0) => {
    const d = startOf(proposal.start_date);
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  };

  // Coordinates for the two fixed addresses in the proposal, so these pins are
  // exact rather than dependent on a geocoder round-trip at seed time.
  const OFFICE = { lat: 37.790373, lng: -122.399199 };
  const CLANCY = { lat: 37.7857, lng: -122.3972 };

  const mk = (
    id: string,
    kind: string,
    title: string,
    start: Date,
    end: Date,
    location: string,
    payload: Record<string, unknown> = {},
  ): DemoItem => ({
    id: `sf-${id}`,
    tripId: "trip-sf-onsite",
    kind,
    title,
    status: "TENTATIVE",
    startTime: start,
    endTime: end,
    location,
    payload: { provider: "Proposal (unpriced)", ...payload },
    createdAt: new Date(),
  });

  const items: DemoItem[] = [
    mk("arrive", "FLIGHT", "All travelers land at SFO", arrival, arrival,
      "San Francisco International Airport", {
        destinationAirport: "SFO",
        description: "Four travelers converge from BER and MUC via FRA, all on LH454.",
        attendeeCount: travelers.length,
      }),
    mk("transfer", "TRANSFER", "SFO → hotel group transfer",
      day(0, 13, 30), day(0, 14, 15), "San Francisco International Airport", {
        destinationAirport: "SFO",
        description: "Shared rideshare for all four travelers; no rental car required.",
      }),
    mk("checkin", "HOTEL", "Check in — The Clancy, Autograph Collection",
      day(0, 15, 0), day(0, 15, 30),
      proposal.hotel?.address ?? "299 Second Street, San Francisco", {
        ...CLANCY,
        hotelName: proposal.hotel?.hotel_name,
        address: proposal.hotel?.address,
        roomType: "4 single rooms · 1 wheelchair-accessible",
        checkIn: "15:00",
        checkOut: "11:00",
      }),
    mk("dinner", "RESTAURANT", "Welcome dinner",
      day(0, 19, 30), day(0, 21, 30), "Ferry Building Marketplace, San Francisco", {
        description: "Team dinner on arrival evening. Vegetarian and lactose-free options required.",
      }),
    mk("day1", "EVENT", "Q3 planning — full day session",
      day(1, 9, 0), day(1, 18, 0), proposal.destination_address ?? "525 Market St, San Francisco", {
        ...OFFICE,
        description: "Main working session. 8–10 minutes on foot from the hotel.",
        attendeeCount: travelers.length,
      }),
    mk("day2", "EVENT", "Roadmap deep dive",
      day(2, 9, 30), day(2, 17, 0), proposal.destination_address ?? "525 Market St, San Francisco", {
        ...OFFICE,
        attendeeCount: travelers.length,
      }),
    mk("offsite", "ACTIVITY", "Team activity — Golden Gate Park",
      day(3, 10, 0), day(3, 16, 0), "Golden Gate Park, San Francisco", {
        description: "Optional bonding afternoon before the final working morning.",
      }),
    mk("depart", "FLIGHT", "Departures from SFO",
      day(4, 14, 40), day(4, 14, 40), "San Francisco International Airport", {
        destinationAirport: "SFO",
        description: "Three travelers on LH455 to FRA; Tom Weiss on LH459 direct to MUC.",
      }),
  ];

  return {
    id: "trip-sf-onsite",
    userId,
    title: "Q3 Onsite — San Francisco",
    destination: `${proposal.destination_city}, USA`,
    origin: "Berlin & Munich",
    originAirport: null,
    arrivalAirport: "SFO",
    status: "DRAFT",
    mode: "PLANNING",
    startDate: startOf(proposal.start_date),
    endDate: startOf(proposal.end_date),
    createdAt: new Date(),
    budgets: [
      {
        totalBudget: proposal.budget?.total_budget_usd ?? 0,
        actual: 0,
        remaining: proposal.budget?.total_budget_usd ?? 0,
        currency: proposal.budget?.currency ?? "USD",
      },
    ],
    items,
    alerts: [],
    edges: [],
    bookings: [],
    coordination,
  };
}

/** Proposal legs → the FlightLeg shape the roster renders. */
function legFromProposal(legs: TripProposal["flights"][number]["outbound_legs"]): FlightLeg | undefined {
  if (!legs.length) return undefined;
  const first = legs[0];
  const last = legs[legs.length - 1];
  const depart = parseLocal(first.departure_local_time);
  const arrive = parseLocal(last.arrival_local_time);
  if (!depart || !arrive) return undefined;
  return {
    flightNo: legs.map((l) => l.flight_number).join(" / "),
    carrier: first.airline,
    origin: first.origin_airport,
    destination: last.destination_airport,
    depart,
    arrive,
    cabin: "ECONOMY",
    // Unpriced by design: the proposal returned no live fare.
    priceUsd: 0,
    bookedDaysAhead: 30,
    originTerminal: undefined,
  };
}

function startOf(dateStr: string, offsetDays = 0): Date {
  const d = parseLocal(`${dateStr} 00:00`) ?? new Date();
  if (offsetDays) d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}
