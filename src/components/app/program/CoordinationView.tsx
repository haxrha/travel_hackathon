import {
  AlertTriangle,
  BedDouble,
  Bus,
  CalendarDays,
  Wallet,
} from "lucide-react";
import TripTabs from "./TripTabs";
import TeamTab from "./TeamTab";
import ProposalView from "./ProposalView";
import {
  arrivalClusters,
  fmtDateTime,
  fmtDay,
  fmtDuration,
  fmtTime,
  initials,
  programBlockers,
  programCost,
  roomBlockStatus,
  rsvpSummary,
  usd,
  type Program,
} from "@/lib/enterprise/program";
import type { DemoTrip } from "@/lib/demo/store";

/**
 * Group-coordination surface for a trip. Adapts the trip onto the Program shape
 * the analytics functions expect, so the domain layer stays independent of how
 * trips happen to be stored.
 */
function asProgram(trip: DemoTrip): Program {
  const c = trip.coordination!;
  return {
    id: trip.id,
    name: trip.title,
    purpose: c.purpose,
    status: "BOOKING",
    destination: trip.destination,
    venue: c.agenda[0]?.location ?? trip.destination,
    arrivalAirport: trip.arrivalAirport ?? "",
    startDate: trip.startDate ?? new Date(),
    endDate: trip.endDate ?? new Date(),
    organizerName: "Aryan",
    organizerEmail: "aryan@wayport.demo",
    costCenter: c.costCenter ?? "",
    budgetUsd: Number(trip.budgets[0]?.totalBudget ?? 0),
    policyTier: c.policyTier,
    attendees: c.travelers,
    roomBlocks: c.roomBlocks,
    approvals: c.approvals,
    agenda: c.agenda,
    createdAt: trip.createdAt,
  };
}

export default function CoordinationView({
  trip,
  itinerary,
}: {
  trip: DemoTrip;
  itinerary: React.ReactNode;
}) {
  const program = asProgram(trip);
  const cost = programCost(program);
  const rsvp = rsvpSummary(program);
  const blockers = programBlockers(program);
  const clusters = arrivalClusters(program);
  const blocks = roomBlockStatus(program);
  const c = trip.coordination!;

  const pendingApprovals = c.approvals.filter((a) => a.status === "PENDING").length;
  const budgetTone = cost.utilization > 1 ? "err" : cost.utilization > 0.85 ? "warn" : "ok";

  return (
    <div className="space-y-5">
      {blockers.length > 0 && (
        <section className="wp-card-raised p-5">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-warn" strokeWidth={1.8} />
            <h2 className="wp-section-title">Needs your attention</h2>
          </div>
          <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
            {blockers.map((b) => (
              <li key={b.id} className="wp-card flex items-start gap-3 p-3.5">
                <span
                  className={`mt-1.5 wp-dot-mark ${
                    b.severity === "err"
                      ? "text-err"
                      : b.severity === "warn"
                        ? "text-warn"
                        : "text-text-tertiary"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">{b.title}</div>
                  <div className="mt-0.5 text-xs text-text-tertiary">{b.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="wp-stat">
          <span className="wp-stat-label">Confirmed</span>
          <span className="wp-stat-value">
            {rsvp.accepted}
            <span className="text-lg text-text-tertiary">/{rsvp.total}</span>
          </span>
          <div className="wp-progress mt-1">
            <div
              className="wp-progress-fill"
              data-tone="ok"
              style={{ width: `${Math.round(rsvp.responseRate * 100)}%` }}
            />
          </div>
          <span className="text-xs text-text-tertiary">
            {Math.round(rsvp.responseRate * 100)}% responded
          </span>
        </div>
        <div className="wp-stat">
          <span className="wp-stat-label">Projected spend</span>
          <span className="wp-stat-value">{usd(cost.projectedUsd)}</span>
          <div className="wp-progress mt-1">
            <div
              className="wp-progress-fill"
              data-tone={budgetTone}
              style={{ width: `${Math.min(100, Math.round(cost.utilization * 100))}%` }}
            />
          </div>
          <span className="text-xs text-text-tertiary">
            of {usd(cost.budgetUsd)}
            {cost.estimated ? " · estimated until live quotes" : ""}
          </span>
        </div>
        <div className="wp-stat">
          <span className="wp-stat-label">
            {cost.varianceUsd >= 0 ? "Remaining" : "Over budget"}
          </span>
          <span className={`wp-stat-value ${cost.varianceUsd < 0 ? "text-err" : "text-ok"}`}>
            {usd(Math.abs(cost.varianceUsd))}
          </span>
          <span className="text-xs text-text-tertiary">
            {usd(cost.perAttendeeUsd)} per traveler
          </span>
        </div>
        <div className="wp-stat">
          <span className="wp-stat-label">Ground transfers</span>
          <span className="wp-stat-value">{clusters.length}</span>
          <span className="text-xs text-text-tertiary">
            {clusters.reduce((s, x) => s + x.vansNeeded, 0)} vans ·{" "}
            {usd(clusters.reduce((s, x) => s + x.savingUsd, 0))} saved
          </span>
        </div>
      </section>

      <TripTabs
        tabs={[
          // A trip still awaiting go/no-go leads with the proposal, since
          // nothing else on the page is actionable until it's approved.
          ...(c.proposal
            ? [
                {
                  id: "proposal",
                  label: "Proposal",
                  badge: c.proposal.flags.filter((f) => f.severity === "critical").length
                    ? String(c.proposal.flags.filter((f) => f.severity === "critical").length)
                    : undefined,
                  panel: <ProposalView proposal={c.proposal} />,
                },
              ]
            : []),
          { id: "itinerary", label: "Itinerary", panel: itinerary },
          {
            id: "team",
            label: "Team",
            badge: pendingApprovals ? String(pendingApprovals) : undefined,
            panel: (
              <TeamTab
                tripId={trip.id}
                travelers={c.travelers}
                tier={c.policyTier}
                roomBlocks={c.roomBlocks}
                approvals={c.approvals}
              />
            ),
          },
          {
            id: "arrivals",
            label: "Arrivals",
            panel: (
              <section className="wp-card p-6">
                <div className="flex items-center gap-2.5">
                  <Bus size={17} className="text-ember" strokeWidth={1.7} />
                  <h2 className="wp-section-title">Arrival convergence</h2>
                </div>
                <p className="mt-1.5 text-sm text-text-tertiary">
                  Arrivals into {trip.arrivalAirport} grouped into shared transfers — nobody
                  waits more than 75 minutes.
                </p>
                <ol className="mt-5 space-y-3">
                  {clusters.map((cl, i) => (
                    <li key={i} className="wp-card-sunken p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ember/15 text-xs font-semibold text-ember ring-1 ring-ember/25">
                            {i + 1}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-text-primary">
                              {fmtDateTime(cl.from)}
                              {cl.to.getTime() !== cl.from.getTime() &&
                                ` – ${fmtTime(cl.to)}`}
                            </div>
                            <div className="text-xs text-text-tertiary">
                              {cl.attendees.length} travelers · {cl.vansNeeded}{" "}
                              {cl.vansNeeded === 1 ? "van" : "vans"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="wp-avatar-stack">
                            {cl.attendees.slice(0, 5).map((a) => (
                              <span key={a.id} className="wp-avatar" title={a.name}>
                                {initials(a.name)}
                              </span>
                            ))}
                            {cl.attendees.length > 5 && (
                              <span className="wp-avatar">+{cl.attendees.length - 5}</span>
                            )}
                          </div>
                          {cl.savingUsd > 0 && (
                            <span className="wp-badge wp-badge-ok">
                              saves {usd(cl.savingUsd)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="wp-table-wrap mt-3">
                        <table className="wp-table">
                          <thead>
                            <tr>
                              <th>Traveler</th>
                              <th>Flight</th>
                              <th>From</th>
                              <th>Lands</th>
                              <th>Terminal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cl.attendees.map((a) => (
                              <tr key={a.id}>
                                <td className="text-text-primary">{a.name}</td>
                                <td className="whitespace-nowrap">
                                  {a.inbound!.carrier} {a.inbound!.flightNo}
                                </td>
                                <td className="font-mono text-xs">{a.originAirport}</td>
                                <td className="whitespace-nowrap">
                                  {fmtDateTime(a.inbound!.arrive)}
                                </td>
                                <td>{a.inbound!.destinationTerminal ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ),
          },
          {
            id: "lodging",
            label: "Lodging",
            panel: (
              <section className="wp-card p-6">
                <div className="flex items-center gap-2.5">
                  <BedDouble size={17} className="text-ember" strokeWidth={1.7} />
                  <h2 className="wp-section-title">Room blocks</h2>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {blocks.map((s) => (
                    <div key={s.block.id} className="wp-card-sunken p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-text-primary">
                            {s.block.hotelName}
                          </div>
                          <div className="mt-0.5 text-xs text-text-tertiary">
                            {s.block.address}
                          </div>
                        </div>
                        {s.block.isContractedRate ? (
                          <span className="wp-badge wp-badge-ok">Contracted</span>
                        ) : (
                          <span className="wp-badge wp-badge-neutral">Market rate</span>
                        )}
                      </div>
                      <div className="mt-4 flex items-baseline justify-between text-sm">
                        {s.block.nightlyRateUsd ? (
                          <span className="tabular-nums text-text-secondary">
                            {usd(s.block.nightlyRateUsd)}/night
                          </span>
                        ) : (
                          <span className="wp-badge wp-badge-warn">Rate not quoted</span>
                        )}
                        <span className="tabular-nums text-text-tertiary">
                          {s.assigned}/{s.block.roomsHeld} rooms
                        </span>
                      </div>
                      <div className="wp-progress mt-2">
                        <div
                          className="wp-progress-fill"
                          data-tone={s.utilization >= 0.9 ? "ok" : s.daysToCutoff <= 6 ? "warn" : undefined}
                          style={{ width: `${Math.round(s.utilization * 100)}%` }}
                        />
                      </div>
                      <div className="mt-3 text-xs text-text-tertiary">
                        {s.block.walkMinutesToVenue} min walk to venue · cutoff{" "}
                        {fmtDay(s.block.cutoffDate)} ({s.daysToCutoff}d)
                        {s.unassigned > 0 && ` · ${s.unassigned} at risk`}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ),
          },
          {
            id: "agenda",
            label: "Agenda",
            panel: (
              <section className="wp-card p-6">
                <div className="flex items-center gap-2.5">
                  <CalendarDays size={17} className="text-ember" strokeWidth={1.7} />
                  <h2 className="wp-section-title">Shared agenda</h2>
                </div>
                <ol className="mt-5 space-y-2.5">
                  {c.agenda.map((e) => (
                    <li
                      key={e.id}
                      className="wp-card-sunken flex flex-wrap items-center gap-4 p-4"
                    >
                      <div className="w-40 shrink-0">
                        <div className="text-sm font-medium text-text-primary">
                          {fmtDateTime(e.start)}
                        </div>
                        <div className="text-xs text-text-tertiary">
                          {fmtDuration(
                            Math.round((e.end.getTime() - e.start.getTime()) / 60_000),
                          )}
                        </div>
                      </div>
                      <div className="min-w-[12rem] flex-1">
                        <div className="text-sm font-medium text-text-primary">{e.title}</div>
                        <div className="text-xs text-text-tertiary">{e.location}</div>
                      </div>
                      {e.mandatory ? (
                        <span className="wp-badge wp-badge-accent">Required</span>
                      ) : (
                        <span className="wp-badge wp-badge-neutral">Optional</span>
                      )}
                      <span className="text-xs text-text-tertiary">
                        {e.attendeeIds.length === 0
                          ? "Whole trip"
                          : `${e.attendeeIds.length} people`}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ),
          },
          {
            id: "budget",
            label: "Budget",
            panel: (
              <section className="wp-card p-6">
                <div className="flex items-center gap-2.5">
                  <Wallet size={17} className="text-ember" strokeWidth={1.7} />
                  <h2 className="wp-section-title">Budget</h2>
                  {c.costCenter && (
                    <span className="wp-badge wp-badge-neutral">{c.costCenter}</span>
                  )}
                </div>
                {cost.estimated && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn/8 px-4 py-3">
                    <span className="mt-1.5 wp-dot-mark text-warn" />
                    <p className="text-sm text-text-secondary">
                      Projected from route and room estimates — live fares have not
                      returned yet. Numbers update as quotes land; RSVP response rate
                      does not hide spend.
                    </p>
                  </div>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="wp-card-sunken p-4">
                    <div className="wp-stat-label">Committed</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">
                      {usd(cost.committedUsd)}
                    </div>
                    <div className="mt-0.5 text-xs text-text-tertiary">Ticketed and booked</div>
                  </div>
                  <div className="wp-card-sunken p-4">
                    <div className="wp-stat-label">Pipeline</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">
                      {usd(cost.pipelineUsd)}
                    </div>
                    <div className="mt-0.5 text-xs text-text-tertiary">
                      {cost.estimated ? "Estimated, not booked" : "Priced, not booked"}
                    </div>
                  </div>
                  <div className="wp-card-sunken p-4">
                    <div className="wp-stat-label">Variance</div>
                    <div
                      className={`mt-1 text-xl font-semibold tabular-nums ${
                        cost.varianceUsd < 0 ? "text-err" : "text-ok"
                      }`}
                    >
                      {cost.varianceUsd < 0 ? "−" : "+"}
                      {usd(Math.abs(cost.varianceUsd))}
                    </div>
                    <div className="mt-0.5 text-xs text-text-tertiary">
                      against {usd(cost.budgetUsd)}
                    </div>
                  </div>
                </div>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
