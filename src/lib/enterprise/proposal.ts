/**
 * Trip proposals — the agent-authored plan an organizer approves or rejects.
 *
 * A proposal is what the research agents produce *before* anything is bookable:
 * a concrete schedule, a hotel, room assignments, and an honest account of what
 * could not be verified.
 *
 * The defining property of this document is missing data. Prices arrive as
 * `{ amount_usd: null, status: "unavailable", notes: "..." }` far more often
 * than as numbers, and the whole point of the format is that an unpriced plan
 * says so instead of guessing. So `Money` is modelled as a discriminated state
 * rather than `number | null`, and the renderer is required to handle the
 * unavailable case — a proposal that renders "$0" where it means "we could not
 * get a quote" is worse than useless, because it reads as free.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Wire schema — matches the agent output verbatim (snake_case)
// ─────────────────────────────────────────────────────────────

const MoneySchema = z.object({
  amount_usd: z.number().nullable(),
  status: z.string(),
  notes: z.string().nullable().optional(),
});

const LegSchema = z.object({
  flight_number: z.string(),
  airline: z.string(),
  origin_airport: z.string(),
  destination_airport: z.string(),
  departure_local_time: z.string(),
  arrival_local_time: z.string(),
});

const FlightPlanSchema = z.object({
  traveler_name: z.string(),
  home_airport: z.string(),
  destination_airport: z.string(),
  outbound_legs: z.array(LegSchema).default([]),
  return_legs: z.array(LegSchema).default([]),
  destination_arrival_local_time: z.string().nullable().optional(),
  origin_departure_local_time: z.string().nullable().optional(),
  airline_preference_honored: z.boolean().nullable().optional(),
  seat_preference: z.string().nullable().optional(),
  special_requests: z.array(z.string()).default([]),
  price: MoneySchema,
  risk_flags: z.array(z.string()).default([]),
});

const RoomSchema = z.object({
  traveler_name: z.string(),
  room_type: z.string(),
  accessible: z.boolean().default(false),
  accessibility_notes: z.string().nullable().optional(),
  price: MoneySchema,
});

const HotelSchema = z.object({
  hotel_name: z.string(),
  address: z.string(),
  star_rating: z.number().nullable().optional(),
  walking_distance_to_office: z.string().nullable().optional(),
  check_in: z.string(),
  check_out: z.string(),
  rooms: z.array(RoomSchema).default([]),
  total_price: MoneySchema,
  alternatives_considered: z.array(z.string()).default([]),
});

const GroundSchema = z.object({
  description: z.string(),
  traveler_names: z.array(z.string()).default([]),
  price: MoneySchema,
});

const BudgetSchema = z.object({
  total_budget_usd: z.number().nullable().optional(),
  per_person_limit_usd: z.number().nullable().optional(),
  currency: z.string().default("USD"),
  breakdown: z
    .array(z.object({ category: z.string(), price: MoneySchema }))
    .default([]),
  estimated_total_cost: MoneySchema.optional(),
  per_traveler_cost_usd: z.record(z.string(), z.number()).default({}),
  over_budget: z.boolean().nullable().optional(),
  approval_status: z.string().default("pending"),
  approver: z.string().nullable().optional(),
});

const FlagSchema = z.object({
  severity: z.enum(["critical", "warning", "info"]).catch("info"),
  message: z.string(),
});

const MapPointSchema = z.object({
  traveler_name: z.string(),
  home_city: z.string(),
  home_airport: z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export const TripProposalSchema = z.object({
  request_id: z.string(),
  trip_purpose: z.string(),
  destination_city: z.string(),
  destination_address: z.string().nullable().optional(),
  start_date: z.string(),
  end_date: z.string(),
  summary: z.string(),
  status: z.string(),
  travel_map: z.array(MapPointSchema).default([]),
  flights: z.array(FlightPlanSchema).default([]),
  hotel: HotelSchema.nullable().optional(),
  ground_transportation: z.array(GroundSchema).default([]),
  budget: BudgetSchema.optional(),
  flags: z.array(FlagSchema).default([]),
  next_steps: z.array(z.string()).default([]),
});

export type TripProposal = z.infer<typeof TripProposalSchema>;
export type ProposalMoney = z.infer<typeof MoneySchema>;
export type ProposalFlight = z.infer<typeof FlightPlanSchema>;
export type ProposalLeg = z.infer<typeof LegSchema>;
export type ProposalRoom = z.infer<typeof RoomSchema>;
export type ProposalFlag = z.infer<typeof FlagSchema>;

/** Parses agent output, returning either the proposal or readable errors. */
export function parseProposal(
  raw: unknown,
): { ok: true; proposal: TripProposal } | { ok: false; errors: string[] } {
  const result = TripProposalSchema.safeParse(raw);
  if (result.success) return { ok: true, proposal: result.data };
  return {
    ok: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    ),
  };
}

// ─────────────────────────────────────────────────────────────
// Derived views
// ─────────────────────────────────────────────────────────────

/** True when a Money carries an actual figure. */
export function isPriced(m?: ProposalMoney | null): m is ProposalMoney & { amount_usd: number } {
  return Boolean(m && typeof m.amount_usd === "number");
}

export function money(m?: ProposalMoney | null): string {
  return isPriced(m) ? `$${Math.round(m.amount_usd).toLocaleString("en-US")}` : "Not quoted";
}

export interface PricingCoverage {
  total: number;
  priced: number;
  /** 0–1. Drives the "how much of this plan is real" meter. */
  ratio: number;
  unpricedLabels: string[];
}

/**
 * How much of the proposal actually carries a price. An organizer's first
 * question about an unpriced plan is "how much of it is unpriced" — this
 * answers that in one number instead of making them scan for nulls.
 */
export function pricingCoverage(p: TripProposal): PricingCoverage {
  const entries: { label: string; m: ProposalMoney }[] = [];
  for (const f of p.flights) entries.push({ label: `${f.traveler_name} · flights`, m: f.price });
  for (const r of p.hotel?.rooms ?? []) entries.push({ label: `${r.traveler_name} · room`, m: r.price });
  for (const g of p.ground_transportation) entries.push({ label: g.description, m: g.price });

  const priced = entries.filter((e) => isPriced(e.m));
  return {
    total: entries.length,
    priced: priced.length,
    ratio: entries.length ? priced.length / entries.length : 0,
    unpricedLabels: entries.filter((e) => !isPriced(e.m)).map((e) => e.label),
  };
}

/** Whether the proposal can be acted on, and why not when it can't. */
export function bookability(p: TripProposal): {
  bookable: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  const coverage = pricingCoverage(p);

  if (p.budget?.approval_status && p.budget.approval_status !== "approved") {
    blockers.push(
      `Budget approval ${p.budget.approval_status}${p.budget.approver ? ` with ${p.budget.approver}` : ""}`,
    );
  }
  if (coverage.priced < coverage.total) {
    blockers.push(
      `${coverage.total - coverage.priced} of ${coverage.total} line items have no live quote`,
    );
  }
  for (const f of p.flags.filter((f) => f.severity === "critical")) {
    blockers.push(f.message);
  }
  return { bookable: blockers.length === 0, blockers };
}

/** Total elapsed minutes across a leg list, including layovers. */
export function journeyMinutes(legs: ProposalLeg[]): number | undefined {
  if (!legs.length) return undefined;
  const start = parseLocal(legs[0].departure_local_time);
  const end = parseLocal(legs[legs.length - 1].arrival_local_time);
  if (!start || !end) return undefined;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

/** Gap between one leg landing and the next departing. */
export function layoverMinutes(a: ProposalLeg, b: ProposalLeg): number | undefined {
  const arrive = parseLocal(a.arrival_local_time);
  const depart = parseLocal(b.departure_local_time);
  if (!arrive || !depart) return undefined;
  return Math.round((depart.getTime() - arrive.getTime()) / 60_000);
}

/**
 * Parses "2026-10-12 08:15" as a wall-clock instant.
 *
 * These are LOCAL times at each airport with no offset supplied, so they are
 * read as UTC and only ever compared within the same airport (layovers) or
 * displayed verbatim. Cross-timezone arithmetic on them would be wrong.
 */
export function parseLocal(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s.trim());
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});
const DATE_ONLY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Oct 12 · 8:15 AM" — always paired with its date. */
export function fmtLocal(s?: string | null): string {
  const d = parseLocal(s);
  return d ? DATE_TIME.format(d) : "—";
}

export function fmtProposalDate(s?: string | null): string {
  const d = parseLocal(s ? `${s} 00:00` : null);
  return d ? DATE_ONLY.format(d) : "—";
}

export function fmtMinutes(m?: number): string {
  if (m == null || m < 0) return "—";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h ? `${h}h${rem ? ` ${rem}m` : ""}` : `${rem}m`;
}

/** Number of nights the hotel is held for. */
export function hotelNights(p: TripProposal): number | undefined {
  const a = parseLocal(p.hotel ? `${p.hotel.check_in} 00:00` : null);
  const b = parseLocal(p.hotel ? `${p.hotel.check_out} 00:00` : null);
  if (!a || !b) return undefined;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}
