"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Car,
  CircleAlert,
  Clock,
  Info,
  ListChecks,
  MapPin,
  Plane,
  Wallet,
} from "lucide-react";
import {
  bookability,
  fmtLocal,
  fmtMinutes,
  fmtProposalDate,
  hotelNights,
  isPriced,
  journeyMinutes,
  layoverMinutes,
  money,
  pricingCoverage,
  type ProposalLeg,
  type TripProposal,
} from "@/lib/enterprise/proposal";
import { initials } from "@/lib/enterprise/program";

const SEVERITY = {
  critical: { tone: "err", Icon: CircleAlert, label: "Critical" },
  warning: { tone: "warn", Icon: AlertTriangle, label: "Warning" },
  info: { tone: "neutral", Icon: Info, label: "Info" },
} as const;

export default function ProposalView({ proposal }: { proposal: TripProposal }) {
  const coverage = pricingCoverage(proposal);
  const { bookable, blockers } = bookability(proposal);
  const nights = hotelNights(proposal);
  const [openTraveler, setOpenTraveler] = useState<string | null>(
    proposal.flights[0]?.traveler_name ?? null,
  );

  return (
    <div className="space-y-5">
      {/* Verdict — the first thing an organizer needs to know. */}
      <section
        className={`wp-card-raised p-5 ${bookable ? "ring-1 ring-ok/30" : "ring-1 ring-err/30"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`wp-badge ${bookable ? "wp-badge-ok" : "wp-badge-err"}`}>
                {bookable ? "Ready to book" : "Not bookable yet"}
              </span>
              <span className="wp-badge wp-badge-neutral">{proposal.request_id}</span>
              <span className="wp-badge wp-badge-neutral">
                {proposal.status.replace(/_/g, " ")}
              </span>
            </div>
            <h2 className="font-display mt-3 text-xl font-semibold">
              {proposal.trip_purpose}
            </h2>
            <p className="mt-1.5 text-sm text-text-secondary">
              {fmtProposalDate(proposal.start_date)} – {fmtProposalDate(proposal.end_date)}
              {" · "}
              {proposal.destination_city}
            </p>
            {proposal.destination_address && (
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-text-tertiary">
                <MapPin size={11} /> {proposal.destination_address}
              </p>
            )}
          </div>

          {/* Quote coverage — how much of this plan is real. */}
          <div className="w-full max-w-[15rem] shrink-0">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-text-tertiary">Live quotes</span>
              <span className="tabular-nums text-text-secondary">
                {coverage.priced}/{coverage.total}
              </span>
            </div>
            <div className="wp-progress mt-1.5">
              <div
                className="wp-progress-fill"
                data-tone={coverage.ratio === 1 ? "ok" : coverage.ratio > 0 ? "warn" : "err"}
                style={{ width: `${Math.round(coverage.ratio * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-text-tertiary">
              {coverage.priced === 0
                ? "No line item has a verified price"
                : `${coverage.total - coverage.priced} still unpriced`}
            </p>
          </div>
        </div>

        {blockers.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-white/8 pt-4">
            {blockers.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-text-secondary">
                <span className="mt-1.5 wp-dot-mark text-err" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Summary */}
      <section className="wp-card p-6">
        <h3 className="wp-section-title">What the agents propose</h3>
        <p className="mt-3 leading-relaxed text-text-secondary">{proposal.summary}</p>
      </section>

      {/* Origins */}
      {proposal.travel_map.length > 0 && (
        <section className="wp-card p-6">
          <div className="flex items-center gap-2.5">
            <MapPin size={17} className="text-ember" strokeWidth={1.7} />
            <h3 className="wp-section-title">Origins</h3>
            <span className="text-sm text-text-tertiary">
              {new Set(proposal.travel_map.map((m) => m.home_airport)).size} departure airports
            </span>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {proposal.travel_map.map((m) => (
              <div key={m.traveler_name} className="wp-card-sunken flex items-center gap-3 p-3.5">
                <span className="wp-avatar">{initials(m.traveler_name)}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {m.traveler_name}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {m.home_city} · <span className="font-mono">{m.home_airport}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Flights */}
      <section className="wp-card p-6">
        <div className="flex items-center gap-2.5">
          <Plane size={17} className="text-ember" strokeWidth={1.7} />
          <h3 className="wp-section-title">Flights</h3>
          <span className="text-sm text-text-tertiary">
            {proposal.flights.length} itineraries
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {proposal.flights.map((f) => {
            const open = openTraveler === f.traveler_name;
            return (
              <div key={f.traveler_name} className="wp-card-sunken overflow-hidden">
                <button
                  onClick={() => setOpenTraveler(open ? null : f.traveler_name)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-4 p-4 text-left transition hover:bg-white/[0.03]"
                >
                  <span className="wp-avatar">{initials(f.traveler_name)}</span>
                  <div className="min-w-[10rem] flex-1">
                    <div className="font-medium text-text-primary">{f.traveler_name}</div>
                    <div className="text-xs text-text-tertiary">
                      <span className="font-mono">{f.home_airport}</span> →{" "}
                      <span className="font-mono">{f.destination_airport}</span>
                      {" · arrives "}
                      {fmtLocal(f.destination_arrival_local_time)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {f.seat_preference && (
                      <span className="wp-badge wp-badge-neutral">{f.seat_preference}</span>
                    )}
                    {f.airline_preference_honored === true && (
                      <span className="wp-badge wp-badge-ok">airline honored</span>
                    )}
                    {f.airline_preference_honored === null && (
                      <span className="wp-badge wp-badge-neutral">airline unconfirmed</span>
                    )}
                    {f.risk_flags.length > 0 && (
                      <span className="wp-badge wp-badge-warn">
                        {f.risk_flags.length} risk{f.risk_flags.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  <PriceTag m={f.price} />
                </button>

                {open && (
                  <div className="space-y-4 border-t border-white/8 bg-black/20 p-4">
                    <LegList title="Outbound" legs={f.outbound_legs} />
                    <LegList title="Return" legs={f.return_legs} />

                    {f.special_requests.length > 0 && (
                      <div>
                        <div className="wp-eyebrow mb-2">Requests to attach at booking</div>
                        <ul className="flex flex-wrap gap-1.5">
                          {f.special_requests.map((r) => (
                            <li key={r} className="wp-badge wp-badge-accent">{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {f.risk_flags.length > 0 && (
                      <div>
                        <div className="wp-eyebrow mb-2">Risks</div>
                        <ul className="space-y-1.5">
                          {f.risk_flags.map((r) => (
                            <li key={r} className="flex items-start gap-2 text-sm text-text-secondary">
                              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!isPriced(f.price) && f.price.notes && (
                      <UnquotedNote note={f.price.notes} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Hotel */}
      {proposal.hotel && (
        <section className="wp-card p-6">
          <div className="flex items-center gap-2.5">
            <BedDouble size={17} className="text-ember" strokeWidth={1.7} />
            <h3 className="wp-section-title">Lodging</h3>
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-medium text-text-primary">
                {proposal.hotel.hotel_name}
              </div>
              <div className="mt-0.5 text-sm text-text-tertiary">{proposal.hotel.address}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
                {proposal.hotel.star_rating != null && (
                  <span>{proposal.hotel.star_rating.toFixed(1)}★</span>
                )}
                <span>
                  {fmtProposalDate(proposal.hotel.check_in)} →{" "}
                  {fmtProposalDate(proposal.hotel.check_out)}
                  {nights ? ` · ${nights} nights` : ""}
                </span>
                {proposal.hotel.walking_distance_to_office && (
                  <span>{proposal.hotel.walking_distance_to_office}</span>
                )}
              </div>
            </div>
            <PriceTag m={proposal.hotel.total_price} label="Total" />
          </div>

          <div className="wp-table-wrap mt-5">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Traveler</th>
                  <th>Room</th>
                  <th>Accessible</th>
                  <th className="wp-num">Price</th>
                </tr>
              </thead>
              <tbody>
                {proposal.hotel.rooms.map((r) => (
                  <tr key={r.traveler_name}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="wp-avatar !h-7 !w-7 !text-[10px]">
                          {initials(r.traveler_name)}
                        </span>
                        <span className="text-text-primary">{r.traveler_name}</span>
                      </div>
                    </td>
                    <td>
                      {r.room_type}
                      {r.accessibility_notes && (
                        <div className="mt-1 text-xs text-warn">{r.accessibility_notes}</div>
                      )}
                    </td>
                    <td>
                      {r.accessible ? (
                        <span className="wp-badge wp-badge-accent">Accessible</span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="wp-num">
                      {isPriced(r.price) ? (
                        money(r.price)
                      ) : (
                        <span className="text-text-tertiary">Not quoted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {proposal.hotel.alternatives_considered.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer list-none text-xs uppercase tracking-[0.14em] text-text-tertiary hover:text-text-secondary">
                {proposal.hotel.alternatives_considered.length} alternatives considered
              </summary>
              <ul className="mt-3 space-y-2">
                {proposal.hotel.alternatives_considered.map((a) => (
                  <li key={a} className="text-sm text-text-secondary">
                    · {a}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* Ground */}
      {proposal.ground_transportation.length > 0 && (
        <section className="wp-card p-6">
          <div className="flex items-center gap-2.5">
            <Car size={17} className="text-ember" strokeWidth={1.7} />
            <h3 className="wp-section-title">Ground transport</h3>
          </div>
          <ul className="mt-4 space-y-2.5">
            {proposal.ground_transportation.map((g) => (
              <li
                key={g.description}
                className="wp-card-sunken flex flex-wrap items-center gap-4 p-4"
              >
                <div className="min-w-[12rem] flex-1">
                  <div className="text-sm text-text-primary">{g.description}</div>
                  <div className="mt-0.5 text-xs text-text-tertiary">
                    {g.traveler_names.length} travelers
                  </div>
                </div>
                <div className="wp-avatar-stack">
                  {g.traveler_names.slice(0, 5).map((n) => (
                    <span key={n} className="wp-avatar !h-7 !w-7 !text-[10px]" title={n}>
                      {initials(n)}
                    </span>
                  ))}
                </div>
                <PriceTag m={g.price} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Budget */}
      {proposal.budget && (
        <section className="wp-card p-6">
          <div className="flex items-center gap-2.5">
            <Wallet size={17} className="text-ember" strokeWidth={1.7} />
            <h3 className="wp-section-title">Budget</h3>
            <span
              className={`wp-badge ${
                proposal.budget.approval_status === "approved"
                  ? "wp-badge-ok"
                  : "wp-badge-warn"
              }`}
            >
              {proposal.budget.approval_status}
              {proposal.budget.approver ? ` · ${proposal.budget.approver}` : ""}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="wp-card-sunken p-4">
              <div className="wp-stat-label">Total budget</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {proposal.budget.total_budget_usd != null
                  ? `$${proposal.budget.total_budget_usd.toLocaleString("en-US")}`
                  : "—"}
              </div>
            </div>
            <div className="wp-card-sunken p-4">
              <div className="wp-stat-label">Per person cap</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {proposal.budget.per_person_limit_usd != null
                  ? `$${proposal.budget.per_person_limit_usd.toLocaleString("en-US")}`
                  : "—"}
              </div>
            </div>
            <div className="wp-card-sunken p-4">
              <div className="wp-stat-label">Estimated cost</div>
              <div
                className={`mt-1 text-xl font-semibold tabular-nums ${
                  isPriced(proposal.budget.estimated_total_cost) ? "" : "text-warn"
                }`}
              >
                {money(proposal.budget.estimated_total_cost)}
              </div>
              <div className="mt-0.5 text-xs text-text-tertiary">
                {proposal.budget.over_budget == null
                  ? "Compliance unknown"
                  : proposal.budget.over_budget
                    ? "Over budget"
                    : "Within budget"}
              </div>
            </div>
          </div>

          <div className="wp-table-wrap mt-4">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Status</th>
                  <th className="wp-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {proposal.budget.breakdown.map((b) => (
                  <tr key={b.category}>
                    <td className="capitalize text-text-primary">
                      {b.category.replace(/_/g, " ")}
                    </td>
                    <td>
                      <span
                        className={`wp-badge ${isPriced(b.price) ? "wp-badge-ok" : "wp-badge-warn"}`}
                      >
                        {b.price.status}
                      </span>
                      {b.price.notes && (
                        <div className="mt-1 text-xs text-text-tertiary">{b.price.notes}</div>
                      )}
                    </td>
                    <td className="wp-num">
                      {isPriced(b.price) ? (
                        money(b.price)
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Flags */}
      {proposal.flags.length > 0 && (
        <section className="wp-card p-6">
          <h3 className="wp-section-title">Flags</h3>
          <ul className="mt-4 space-y-2">
            {(["critical", "warning", "info"] as const).flatMap((sev) =>
              proposal.flags
                .filter((f) => f.severity === sev)
                .map((f, i) => {
                  const { tone, Icon, label } = SEVERITY[sev];
                  return (
                    <li
                      key={`${sev}-${i}`}
                      className="wp-card-sunken flex items-start gap-3 p-3.5"
                    >
                      <Icon
                        size={15}
                        className={`mt-0.5 shrink-0 ${
                          tone === "err" ? "text-err" : tone === "warn" ? "text-warn" : "text-text-tertiary"
                        }`}
                      />
                      <div className="min-w-0">
                        <span className={`wp-badge wp-badge-${tone}`}>{label}</span>
                        <p className="mt-1.5 text-sm text-text-secondary">{f.message}</p>
                      </div>
                    </li>
                  );
                }),
            )}
          </ul>
        </section>
      )}

      {/* Next steps */}
      {proposal.next_steps.length > 0 && (
        <section className="wp-card p-6">
          <div className="flex items-center gap-2.5">
            <ListChecks size={17} className="text-ember" strokeWidth={1.7} />
            <h3 className="wp-section-title">Next steps</h3>
          </div>
          <ol className="mt-4 space-y-2.5">
            {proposal.next_steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ember/15 text-[10px] font-semibold text-ember ring-1 ring-ember/25">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed text-text-secondary">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Renders a leg chain with layovers called out between segments. */
function LegList({ title, legs }: { title: string; legs: ProposalLeg[] }) {
  if (!legs.length) return null;
  const total = journeyMinutes(legs);

  return (
    <div>
      <div className="wp-eyebrow mb-2 flex items-center gap-2">
        {title}
        {total != null && (
          <span className="normal-case tracking-normal text-text-tertiary">
            · {fmtMinutes(total)} total
          </span>
        )}
      </div>

      <ol className="space-y-1.5">
        {legs.map((leg, i) => {
          const prev = i > 0 ? legs[i - 1] : null;
          const layover = prev ? layoverMinutes(prev, leg) : undefined;
          // Under an hour is tight enough that a delay breaks the connection.
          const tight = layover != null && layover < 60;

          return (
            <li key={`${leg.flight_number}-${i}`}>
              {prev && (
                <div
                  className={`mb-1.5 flex items-center gap-1.5 pl-3 text-xs ${
                    tight ? "text-warn" : "text-text-tertiary"
                  }`}
                >
                  <Clock size={11} />
                  {fmtMinutes(layover)} connection in {prev.destination_airport}
                  {tight && " · tight"}
                </div>
              )}

              <div className="rounded-lg border border-white/8 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">
                    {leg.airline} {leg.flight_number}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-xs text-text-secondary">
                    {leg.origin_airport}
                    <ArrowRight size={11} className="text-ember" />
                    {leg.destination_airport}
                  </span>
                </div>
                {/* Both endpoints carry their date — these legs cross midnight. */}
                <div className="mt-1.5 text-xs text-text-secondary">
                  {fmtLocal(leg.departure_local_time)}
                  {" → "}
                  {fmtLocal(leg.arrival_local_time)}
                  <span className="ml-1.5 text-text-tertiary">local</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PriceTag({
  m,
  label,
}: {
  m: { amount_usd: number | null; status: string; notes?: string | null };
  label?: string;
}) {
  if (isPriced(m)) {
    return (
      <div className="text-right">
        {label && <div className="text-xs text-text-tertiary">{label}</div>}
        <div className="font-semibold tabular-nums text-text-primary">{money(m)}</div>
      </div>
    );
  }
  return (
    <div className="text-right">
      {label && <div className="text-xs text-text-tertiary">{label}</div>}
      <span className="wp-badge wp-badge-warn" title={m.notes ?? undefined}>
        {m.status === "unavailable" ? "Not quoted" : m.status}
      </span>
    </div>
  );
}

function UnquotedNote({ note }: { note: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/8 px-3.5 py-2.5">
      <Info size={13} className="mt-0.5 shrink-0 text-warn" />
      <p className="text-xs text-text-secondary">{note}</p>
    </div>
  );
}
