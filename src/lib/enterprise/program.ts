/**
 * WAYPORT Programs — company-managed group travel.
 *
 * A Program is what a manager actually plans: one destination, one date range,
 * many employees converging from different origins. The hard parts aren't the
 * individual itineraries (the agent layer handles those) — they're the
 * cross-traveler questions:
 *
 *   - who has actually confirmed, and who is silently blocking the room block
 *   - which bookings breach travel policy and therefore need my sign-off
 *   - when everyone lands, and how few ground transfers that can collapse into
 *   - what this costs the cost center, committed vs projected
 *
 * This module owns those computations. It is pure — the store seeds and mutates,
 * the pages render, everything derived lives here so it stays testable.
 */

// ─────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────

export type ProgramPurpose =
  | "OFFSITE"
  | "CONFERENCE"
  | "CLIENT_VISIT"
  | "TRAINING"
  | "RECRUITING";

export type ProgramStatus = "DRAFT" | "COLLECTING" | "BOOKING" | "LOCKED" | "COMPLETE";

/** Whether the person is coming at all. Gates every downstream booking. */
export type RsvpStatus = "INVITED" | "ACCEPTED" | "TENTATIVE" | "DECLINED";

/** How far along that person's travel is. */
export type TravelStatus =
  | "NOT_STARTED"
  | "OPTIONS_READY"
  | "PENDING_APPROVAL"
  | "BOOKED";

export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS";

export interface TravelPolicyTier {
  id: string;
  name: string;
  /** Per-leg cap. A round trip is checked against 2x this. */
  maxFlightUsd: number;
  maxNightlyUsd: number;
  maxCabin: CabinClass;
  /** Booking closer than this to departure is flagged as a late-booking premium. */
  advanceBookingDays: number;
  /** Anything above this needs explicit manager sign-off even if in policy. */
  requiresApprovalOverUsd: number;
}

export interface FlightLeg {
  flightNo: string;
  carrier: string;
  origin: string;
  originTerminal?: string;
  destination: string;
  destinationTerminal?: string;
  depart: Date;
  arrive: Date;
  cabin: CabinClass;
  priceUsd: number;
  /** Days between booking and departure — drives the late-booking flag. */
  bookedDaysAhead: number;
  /** Populated from live flight status when available. */
  gate?: string;
  aircraftName?: string;
  confirmationCode?: string;
}

export interface Attendee {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  originAirport: string;
  /** Free-text home city, shown alongside the airport code. */
  homeCity?: string;
  /** Home coordinates, for the origin map. */
  lat?: number;
  lng?: number;
  rsvp: RsvpStatus;
  travelStatus: TravelStatus;
  inbound?: FlightLeg;
  outbound?: FlightLeg;
  /** Room block this person is assigned to, if any. */
  roomBlockId?: string;
  nightlyRateUsd?: number;
  nights?: number;
  dietary?: string[];
  accessibility?: string[];
  seatPreference?: "aisle" | "window" | "no preference";
  /** Frequent-flyer / hotel programs, e.g. { "Miles & More": "LH4471203" }. */
  loyaltyNumbers?: Record<string, string>;
  /** TSA Known Traveler Number. */
  knownTravelerNumber?: string;
  airlinePreference?: string;
  /** Set when the traveler asked to deviate (extend, reroute, bring a partner). */
  deviationNote?: string;
}

export interface RoomBlock {
  id: string;
  hotelName: string;
  address: string;
  /**
   * Negotiated corporate rate. Undefined means no quote has come back yet —
   * distinct from zero, which would read as free.
   */
  nightlyRateUsd?: number;
  isContractedRate: boolean;
  roomsHeld: number;
  /** Unassigned rooms are released back to the hotel at cutoff. */
  cutoffDate: Date;
  walkMinutesToVenue: number;
}

export type ApprovalKind =
  | "OVER_POLICY_FLIGHT"
  | "OVER_POLICY_HOTEL"
  | "CABIN_UPGRADE"
  | "LATE_BOOKING"
  | "TRIP_DEVIATION";

export interface ApprovalRequest {
  id: string;
  attendeeId: string;
  kind: ApprovalKind;
  amountUsd: number;
  /** Amount above the policy cap — what the manager is actually approving. */
  overageUsd: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  requestedAt: Date;
  decidedAt?: Date;
  decidedBy?: string;
}

export interface AgendaEntry {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location: string;
  /** Empty means whole-program. */
  attendeeIds: string[];
  mandatory: boolean;
}

export interface Program {
  id: string;
  name: string;
  purpose: ProgramPurpose;
  status: ProgramStatus;
  destination: string;
  venue: string;
  arrivalAirport: string;
  startDate: Date;
  endDate: Date;
  organizerName: string;
  organizerEmail: string;
  costCenter: string;
  budgetUsd: number;
  policyTier: TravelPolicyTier;
  attendees: Attendee[];
  roomBlocks: RoomBlock[];
  approvals: ApprovalRequest[];
  agenda: AgendaEntry[];
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────
// Policy
// ─────────────────────────────────────────────────────────────

export interface PolicyFlag {
  kind: ApprovalKind;
  severity: "warn" | "err";
  label: string;
  detail: string;
  overageUsd: number;
}

export const STANDARD_TIER: TravelPolicyTier = {
  id: "tier-standard",
  name: "Standard (IC)",
  maxFlightUsd: 550,
  maxNightlyUsd: 260,
  maxCabin: "ECONOMY",
  advanceBookingDays: 14,
  requiresApprovalOverUsd: 1500,
};

export const LEADERSHIP_TIER: TravelPolicyTier = {
  id: "tier-leadership",
  name: "Leadership",
  maxFlightUsd: 1400,
  maxNightlyUsd: 420,
  maxCabin: "BUSINESS",
  advanceBookingDays: 7,
  requiresApprovalOverUsd: 4000,
};

/**
 * Which tier a given traveler is actually held to.
 *
 * Every caller must go through this — the approval queue, the roster, and the
 * company directory all evaluate the same person, and if they disagree the UI
 * shows a policy breach with no corresponding approval to clear it.
 */
export function tierFor(a: Attendee, programTier: TravelPolicyTier): TravelPolicyTier {
  const leadership = /^(VP|SVP|Chief|Head of)\b/.test(a.title);
  return leadership ? LEADERSHIP_TIER : programTier;
}

const CABIN_RANK: Record<CabinClass, number> = {
  ECONOMY: 0,
  PREMIUM_ECONOMY: 1,
  BUSINESS: 2,
};

const CABIN_LABEL: Record<CabinClass, string> = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium economy",
  BUSINESS: "Business",
};

export function cabinLabel(c: CabinClass): string {
  return CABIN_LABEL[c];
}

/**
 * Every way a single attendee's travel breaches the program's policy tier.
 * Returns an empty array for a fully compliant traveler.
 */
export function checkPolicy(a: Attendee, tier: TravelPolicyTier): PolicyFlag[] {
  const flags: PolicyFlag[] = [];
  const legs = [a.inbound, a.outbound].filter(Boolean) as FlightLeg[];

  const airfare = legs.reduce((sum, l) => sum + l.priceUsd, 0);
  const airfareCap = tier.maxFlightUsd * Math.max(legs.length, 1);
  if (airfare > airfareCap) {
    flags.push({
      kind: "OVER_POLICY_FLIGHT",
      severity: "err",
      label: "Airfare over cap",
      detail: `${usd(airfare)} against a ${usd(airfareCap)} cap`,
      overageUsd: airfare - airfareCap,
    });
  }

  for (const leg of legs) {
    if (CABIN_RANK[leg.cabin] > CABIN_RANK[tier.maxCabin]) {
      flags.push({
        kind: "CABIN_UPGRADE",
        severity: "warn",
        label: "Cabin above tier",
        detail: `${CABIN_LABEL[leg.cabin]} on ${leg.flightNo}, tier allows ${CABIN_LABEL[tier.maxCabin]}`,
        overageUsd: 0,
      });
      break;
    }
  }

  const lateLeg = legs.find((l) => l.bookedDaysAhead < tier.advanceBookingDays);
  if (lateLeg) {
    flags.push({
      kind: "LATE_BOOKING",
      severity: "warn",
      label: "Late booking",
      detail: `Booked ${lateLeg.bookedDaysAhead}d ahead, policy asks for ${tier.advanceBookingDays}d`,
      overageUsd: 0,
    });
  }

  if (a.nightlyRateUsd != null && a.nightlyRateUsd > tier.maxNightlyUsd) {
    const nights = a.nights ?? 1;
    flags.push({
      kind: "OVER_POLICY_HOTEL",
      severity: "err",
      label: "Nightly rate over cap",
      detail: `${usd(a.nightlyRateUsd)}/night against ${usd(tier.maxNightlyUsd)}`,
      overageUsd: (a.nightlyRateUsd - tier.maxNightlyUsd) * nights,
    });
  }

  if (a.deviationNote) {
    flags.push({
      kind: "TRIP_DEVIATION",
      severity: "warn",
      label: "Trip deviation",
      detail: a.deviationNote,
      overageUsd: 0,
    });
  }

  return flags;
}

/**
 * Derives the approval queue from current policy state.
 *
 * Approvals are never authored by hand — they are a projection of `checkPolicy`,
 * which is the only way the queue and the per-traveler flags can stay in sync.
 * Ids are deterministic (`attendee:kind`) so re-deriving preserves decisions
 * without needing a uuid source, keeping this module client-safe.
 */
export function buildApprovals(
  attendees: Attendee[],
  programTier: TravelPolicyTier,
  existing: ApprovalRequest[] = [],
): ApprovalRequest[] {
  const prior = new Map(existing.map((a) => [a.id, a]));
  const out: ApprovalRequest[] = [];

  for (const a of attendees) {
    if (a.rsvp === "DECLINED") continue;
    for (const flag of checkPolicy(a, tierFor(a, programTier))) {
      const id = `${a.id}:${flag.kind}`;
      const seen = prior.get(id);
      if (seen) {
        out.push(seen);
        continue;
      }
      out.push({
        id,
        attendeeId: a.id,
        kind: flag.kind,
        amountUsd: attendeeCost(a).totalUsd,
        overageUsd: flag.overageUsd,
        reason: flag.detail,
        status: "PENDING",
        requestedAt: new Date(),
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Cost
// ─────────────────────────────────────────────────────────────

export interface AttendeeCost {
  airfareUsd: number;
  lodgingUsd: number;
  totalUsd: number;
}

export function attendeeCost(a: Attendee): AttendeeCost {
  const airfare =
    (a.inbound?.priceUsd ?? 0) + (a.outbound?.priceUsd ?? 0);
  const lodging = (a.nightlyRateUsd ?? 0) * (a.nights ?? 0);
  return { airfareUsd: airfare, lodgingUsd: lodging, totalUsd: airfare + lodging };
}

/**
 * Projected cost for one traveler — live quote when present, otherwise a
 * route/room estimate so spend is visible before everyone RSVPs or fares land.
 */
export function projectedAttendeeCost(
  a: Attendee,
  p: Program,
): AttendeeCost & { estimated: boolean } {
  const live = attendeeCost(a);
  if (live.totalUsd > 0) return { ...live, estimated: false };

  const nights =
    a.nights ??
    Math.max(
      1,
      Math.round(
        (p.endDate.getTime() - p.startDate.getTime()) / (24 * 60 * 60 * 1000),
      ),
    );
  const blockRate =
    p.roomBlocks.find((b) => b.id === a.roomBlockId)?.nightlyRateUsd ??
    p.roomBlocks.find((b) => typeof b.nightlyRateUsd === "number")?.nightlyRateUsd;
  const nightly = a.nightlyRateUsd ?? blockRate ?? 260;
  const lodgingUsd = nightly * nights;

  const hasFlights = Boolean(a.inbound || a.outbound);
  const airfareUsd = hasFlights || a.rsvp !== "DECLINED"
    ? estimateAirfareUsd(a.originAirport, p.arrivalAirport)
    : 0;

  return {
    airfareUsd,
    lodgingUsd,
    totalUsd: airfareUsd + lodgingUsd,
    estimated: true,
  };
}

/** Rough RT economy by haul — good enough for a projected-spend meter. */
function estimateAirfareUsd(origin: string, arrival: string): number {
  const o = origin.toUpperCase();
  const d = (arrival || "").toUpperCase();
  const sameRegion =
    (EU.has(o) && EU.has(d)) ||
    (US.has(o) && US.has(d)) ||
    (ASIA.has(o) && ASIA.has(d));
  if (sameRegion) return 320;
  if ((US.has(o) && EU.has(d)) || (EU.has(o) && US.has(d))) return 980;
  if ((ASIA.has(o) && (US.has(d) || EU.has(d))) || ((US.has(o) || EU.has(o)) && ASIA.has(d))) {
    return 1200;
  }
  return 750;
}

const US = new Set(["SFO", "JFK", "EWR", "LAX", "ORD", "SEA", "BOS", "DEN", "ATL", "DFW", "IAD", "MIA", "IAH"]);
const EU = new Set(["LHR", "CDG", "AMS", "FRA", "MUC", "BER", "LIS", "BCN", "MAD", "DUB", "ZRH", "FCO", "MXP"]);
const ASIA = new Set(["HND", "NRT", "KIX", "ICN", "SIN", "BKK", "HKG", "BLR", "BOM", "DEL", "DXB"]);

export interface ProgramCost {
  /** Already booked — real money out the door. */
  committedUsd: number;
  /** Priced but not booked. Committed + pipeline is the number to plan against. */
  pipelineUsd: number;
  projectedUsd: number;
  budgetUsd: number;
  varianceUsd: number;
  /** Negative variance as a share of budget, for the meter tone. */
  utilization: number;
  perAttendeeUsd: number;
  /**
   * True when every line item is an estimate (no live fares yet). The UI still
   * shows the dollar figure — it just labels it as projected/estimated.
   */
  estimated: boolean;
  /** @deprecated use `estimated` — kept so older call sites keep compiling. */
  unpriced: boolean;
}

export function programCost(p: Program): ProgramCost {
  let committed = 0;
  let pipeline = 0;
  let anyLive = false;
  // Project for everyone still on the roster — RSVP response rate must not
  // zero out the spend meter.
  const coming = p.attendees.filter((a) => a.rsvp !== "DECLINED");

  for (const a of coming) {
    const { totalUsd, estimated } = projectedAttendeeCost(a, p);
    if (!estimated) anyLive = true;
    if (a.travelStatus === "BOOKED") committed += totalUsd;
    else pipeline += totalUsd;
  }

  const projected = committed + pipeline;
  return {
    committedUsd: committed,
    pipelineUsd: pipeline,
    projectedUsd: projected,
    budgetUsd: p.budgetUsd,
    varianceUsd: p.budgetUsd - projected,
    utilization: p.budgetUsd > 0 ? projected / p.budgetUsd : 0,
    perAttendeeUsd: coming.length ? Math.round(projected / coming.length) : 0,
    estimated: coming.length > 0 && !anyLive,
    unpriced: coming.length > 0 && !anyLive,
  };
}

// ─────────────────────────────────────────────────────────────
// Roster health
// ─────────────────────────────────────────────────────────────

export interface RsvpSummary {
  total: number;
  accepted: number;
  tentative: number;
  declined: number;
  awaiting: number;
  /** Share of invitees who have given a definite yes or no. */
  responseRate: number;
}

export function rsvpSummary(p: Program): RsvpSummary {
  const total = p.attendees.length;
  const by = (s: RsvpStatus) => p.attendees.filter((a) => a.rsvp === s).length;
  const accepted = by("ACCEPTED");
  const declined = by("DECLINED");
  const tentative = by("TENTATIVE");
  const awaiting = by("INVITED");
  return {
    total,
    accepted,
    tentative,
    declined,
    awaiting,
    responseRate: total ? (accepted + declined) / total : 0,
  };
}

export interface BlockStatus {
  block: RoomBlock;
  assigned: number;
  unassigned: number;
  utilization: number;
  daysToCutoff: number;
  /** Rooms that will be released if the remaining invitees don't confirm. */
  atRiskRooms: number;
}

export function roomBlockStatus(p: Program, now = new Date()): BlockStatus[] {
  return p.roomBlocks.map((block) => {
    const assigned = p.attendees.filter(
      (a) => a.roomBlockId === block.id && a.rsvp !== "DECLINED",
    ).length;
    const unassigned = Math.max(0, block.roomsHeld - assigned);
    const daysToCutoff = Math.ceil(
      (block.cutoffDate.getTime() - now.getTime()) / 86_400_000,
    );
    return {
      block,
      assigned,
      unassigned,
      utilization: block.roomsHeld ? assigned / block.roomsHeld : 0,
      daysToCutoff,
      atRiskRooms: unassigned,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Arrival convergence
// ─────────────────────────────────────────────────────────────

export interface ArrivalCluster {
  /** Window the shuttle would wait across. */
  from: Date;
  to: Date;
  airport: string;
  attendees: Attendee[];
  /** One 8-seat van per 8 travelers. */
  vansNeeded: number;
  /** Rough saving vs. everyone taking their own car. */
  savingUsd: number;
}

const SOLO_TRANSFER_USD = 85;
const VAN_TRANSFER_USD = 210;
const VAN_CAPACITY = 8;

/**
 * Collapse individual arrivals into shared ground transfers.
 *
 * Walks arrivals in time order and starts a new cluster whenever the next
 * arrival falls outside `windowMinutes` of the current cluster's first arrival —
 * so nobody waits longer than that window for their ride.
 */
export function arrivalClusters(p: Program, windowMinutes = 75): ArrivalCluster[] {
  const arriving = p.attendees
    .filter((a) => a.rsvp !== "DECLINED" && a.inbound)
    .sort((a, b) => a.inbound!.arrive.getTime() - b.inbound!.arrive.getTime());

  const clusters: ArrivalCluster[] = [];
  const windowMs = windowMinutes * 60_000;

  for (const a of arriving) {
    const arrive = a.inbound!.arrive;
    const current = clusters[clusters.length - 1];

    if (current && arrive.getTime() - current.from.getTime() <= windowMs) {
      current.attendees.push(a);
      current.to = arrive;
    } else {
      clusters.push({
        from: arrive,
        to: arrive,
        airport: a.inbound!.destination,
        attendees: [a],
        vansNeeded: 0,
        savingUsd: 0,
      });
    }
  }

  for (const c of clusters) {
    c.vansNeeded = Math.ceil(c.attendees.length / VAN_CAPACITY);
    const solo = c.attendees.length * SOLO_TRANSFER_USD;
    c.savingUsd = Math.max(0, solo - c.vansNeeded * VAN_TRANSFER_USD);
  }

  return clusters;
}

// ─────────────────────────────────────────────────────────────
// What's actually blocking the manager
// ─────────────────────────────────────────────────────────────

export interface Blocker {
  id: string;
  severity: "err" | "warn" | "info";
  title: string;
  detail: string;
  /** Deep-link target within the program page. */
  anchor: string;
}

/**
 * The single most useful view for an organizer: everything standing between
 * "program created" and "everyone booked", ranked by urgency.
 */
export function programBlockers(p: Program, now = new Date()): Blocker[] {
  const out: Blocker[] = [];
  const rsvp = rsvpSummary(p);

  const pendingApprovals = p.approvals.filter((a) => a.status === "PENDING");
  if (pendingApprovals.length) {
    const total = pendingApprovals.reduce((s, a) => s + a.overageUsd, 0);
    out.push({
      id: "approvals",
      severity: "err",
      title: `${pendingApprovals.length} approval${pendingApprovals.length === 1 ? "" : "s"} waiting on you`,
      detail: total > 0 ? `${usd(total)} in policy overage to sign off` : "Cabin and deviation requests to review",
      anchor: "#approvals",
    });
  }

  for (const s of roomBlockStatus(p, now)) {
    if (s.daysToCutoff <= 10 && s.unassigned > 0) {
      out.push({
        id: `cutoff-${s.block.id}`,
        severity: s.daysToCutoff <= 4 ? "err" : "warn",
        title: `${s.unassigned} room${s.unassigned === 1 ? "" : "s"} release in ${s.daysToCutoff}d`,
        detail: `${s.block.hotelName} cutoff — unassigned rooms go back to the hotel`,
        anchor: "#lodging",
      });
    }
  }

  if (rsvp.awaiting > 0) {
    out.push({
      id: "rsvp",
      severity: rsvp.awaiting > rsvp.total / 3 ? "warn" : "info",
      title: `${rsvp.awaiting} ${rsvp.awaiting === 1 ? "person has" : "people have"} not responded`,
      detail: "Projected spend still includes them — confirm to lock rooms and fares",
      anchor: "#roster",
    });
  }

  const unbooked = p.attendees.filter(
    (a) => a.rsvp === "ACCEPTED" && a.travelStatus !== "BOOKED",
  );
  if (unbooked.length) {
    out.push({
      id: "unbooked",
      severity: "warn",
      title: `${unbooked.length} confirmed ${unbooked.length === 1 ? "attendee" : "attendees"} not booked`,
      detail: "Fares drift the longer these sit unticketed",
      anchor: "#roster",
    });
  }

  const cost = programCost(p);
  if (cost.varianceUsd < 0) {
    out.push({
      id: "budget",
      severity: "err",
      title: `${usd(Math.abs(cost.varianceUsd))} over budget`,
      detail: `Projected ${usd(cost.projectedUsd)} against ${usd(cost.budgetUsd)}`,
      anchor: "#budget",
    });
  }

  const order = { err: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ─────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────

export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const FULL_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Fixed to UTC so server and client render identically.
 *
 * `fmtTime` is intentionally never used on its own in the UI — a bare clock time
 * is ambiguous across a multi-day trip, and an overnight flight arriving "08:40"
 * reads as same-day when it isn't. Use `fmtDateTime` unless the surrounding row
 * already states the date.
 */
export function fmtTime(d: Date): string {
  return TIME_FMT.format(d);
}

export function fmtDay(d: Date): string {
  return DAY_FMT.format(d);
}

export function fmtWeekday(d: Date): string {
  return WEEKDAY_FMT.format(d);
}

export function fmtFullDate(d: Date): string {
  return FULL_FMT.format(d);
}

/** The default for anything time-bearing: "Mar 14 · 08:40". */
export function fmtDateTime(d: Date): string {
  return `${DAY_FMT.format(d)} · ${TIME_FMT.format(d)}`;
}

/**
 * Departure → arrival across a possible date boundary. Appends a +1/+2 day
 * marker when the arrival lands on a later date, the way airlines print it.
 */
export function fmtLegTiming(depart: Date, arrive: Date): string {
  const dayDelta = Math.round(
    (Date.UTC(arrive.getUTCFullYear(), arrive.getUTCMonth(), arrive.getUTCDate()) -
      Date.UTC(depart.getUTCFullYear(), depart.getUTCMonth(), depart.getUTCDate())) /
      86_400_000,
  );
  const arrivalPart =
    dayDelta === 0
      ? TIME_FMT.format(arrive)
      : `${TIME_FMT.format(arrive)} +${dayDelta}`;
  return `${DAY_FMT.format(depart)} · ${TIME_FMT.format(depart)} → ${arrivalPart}`;
}

export function fmtDateRange(a: Date, b: Date): string {
  return `${DAY_FMT.format(a)} – ${FULL_FMT.format(b)}`;
}

/** Minutes → "11h 30m", for flight and layover durations. */
export function fmtDuration(minutes?: number): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export const PURPOSE_LABEL: Record<ProgramPurpose, string> = {
  OFFSITE: "Team offsite",
  CONFERENCE: "Conference",
  CLIENT_VISIT: "Client visit",
  TRAINING: "Training",
  RECRUITING: "Recruiting",
};

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  INVITED: "Awaiting",
  ACCEPTED: "Confirmed",
  TENTATIVE: "Tentative",
  DECLINED: "Declined",
};

export const TRAVEL_LABEL: Record<TravelStatus, string> = {
  NOT_STARTED: "Not started",
  OPTIONS_READY: "Options ready",
  PENDING_APPROVAL: "Needs approval",
  BOOKED: "Booked",
};

export const APPROVAL_LABEL: Record<ApprovalKind, string> = {
  OVER_POLICY_FLIGHT: "Airfare over policy",
  OVER_POLICY_HOTEL: "Lodging over policy",
  CABIN_UPGRADE: "Cabin upgrade",
  LATE_BOOKING: "Late booking",
  TRIP_DEVIATION: "Trip deviation",
};
