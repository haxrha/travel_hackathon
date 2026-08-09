"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, X, Plane, ShieldAlert, UserPlus, Users } from "lucide-react";
import {
  addTravelersToTrip,
  decideApproval,
  removeTravelerFromTrip,
} from "@/app/(app)/app/trips/actions";
import TravelerPicker from "./TravelerPicker";
import type { NewTravelerInput } from "@/lib/enterprise/directory";
import {
  attendeeCost,
  cabinLabel,
  checkPolicy,
  fmtLegTiming,
  fmtDuration,
  initials,
  tierFor,
  usd,
  APPROVAL_LABEL,
  RSVP_LABEL,
  TRAVEL_LABEL,
  type ApprovalRequest,
  type Attendee,
  type RoomBlock,
  type TravelPolicyTier,
} from "@/lib/enterprise/program";

type Filter = "all" | "confirmed" | "unbooked" | "flagged" | "awaiting";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "unbooked", label: "Not booked" },
  { id: "flagged", label: "Policy flags" },
  { id: "awaiting", label: "No response" },
];

const RSVP_TONE: Record<Attendee["rsvp"], string> = {
  ACCEPTED: "wp-badge-ok",
  TENTATIVE: "wp-badge-warn",
  DECLINED: "wp-badge-err",
  INVITED: "wp-badge-neutral",
};

const TRAVEL_TONE: Record<Attendee["travelStatus"], string> = {
  BOOKED: "wp-badge-ok",
  PENDING_APPROVAL: "wp-badge-warn",
  OPTIONS_READY: "wp-badge-accent",
  NOT_STARTED: "wp-badge-neutral",
};

export default function TeamTab({
  tripId,
  travelers,
  tier,
  roomBlocks,
  approvals,
}: {
  tripId: string;
  travelers: Attendee[];
  tier: TravelPolicyTier;
  roomBlocks: RoomBlock[];
  approvals: ApprovalRequest[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Add-travellers drawer state.
  const [addingOpen, setAddingOpen] = useState(false);
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [pickNew, setPickNew] = useState<NewTravelerInput[]>([]);

  // Already-on-the-trip emails, so the picker can't re-add someone.
  const onTrip = useMemo(
    () => new Set(travelers.map((t) => t.email.toLowerCase())),
    [travelers],
  );

  function commitAdditions() {
    startTransition(async () => {
      await addTravelersToTrip(tripId, pickIds, pickNew);
      setPickIds([]);
      setPickNew([]);
      setAddingOpen(false);
    });
  }

  function removeTraveler(attendeeId: string) {
    setBusyId(attendeeId);
    startTransition(async () => {
      await removeTravelerFromTrip(tripId, attendeeId);
      setBusyId(null);
    });
  }

  const blockName = useMemo(
    () => new Map(roomBlocks.map((b) => [b.id, b.hotelName])),
    [roomBlocks],
  );
  const byId = useMemo(
    () => new Map(travelers.map((t) => [t.id, t])),
    [travelers],
  );

  const rows = useMemo(
    () =>
      travelers.map((a) => ({
        a,
        flags: checkPolicy(a, tierFor(a, tier)),
        cost: attendeeCost(a),
      })),
    [travelers, tier],
  );

  const visible = rows.filter(({ a, flags }) => {
    switch (filter) {
      case "confirmed": return a.rsvp === "ACCEPTED";
      case "unbooked": return a.rsvp !== "DECLINED" && a.travelStatus !== "BOOKED";
      case "flagged": return flags.length > 0;
      case "awaiting": return a.rsvp === "INVITED" || a.rsvp === "TENTATIVE";
      default: return true;
    }
  });

  const queue = approvals.filter((a) => a.status === "PENDING");

  function decide(id: string, approve: boolean) {
    setBusyId(id);
    startTransition(async () => {
      await decideApproval(tripId, id, approve);
      setBusyId(null);
    });
  }

  return (
    <div className="space-y-5">
      {/* Approvals */}
      <section className="wp-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={17} className="text-ember" strokeWidth={1.7} />
            <h2 className="wp-section-title">Approvals</h2>
          </div>
          {queue.length > 0 && (
            <span className="wp-badge wp-badge-warn">{queue.length} pending</span>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="mt-4 rounded-xl border border-ok/25 bg-ok/8 px-4 py-3 text-sm text-text-secondary">
            Everyone is within policy or already signed off.
          </div>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {queue.map((r) => {
              const who = byId.get(r.attendeeId);
              if (!who) return null;
              return (
                <li key={r.id} className="wp-card-sunken flex flex-wrap items-center gap-4 p-4">
                  <span className="wp-avatar">{initials(who.name)}</span>
                  <div className="min-w-[11rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{who.name}</span>
                      <span className="wp-badge wp-badge-neutral">{APPROVAL_LABEL[r.kind]}</span>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">{r.reason}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">{usd(r.amountUsd)}</div>
                    {r.overageUsd > 0 && (
                      <div className="text-xs tabular-nums text-err">+{usd(r.overageUsd)} over</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => decide(r.id, false)}
                      disabled={pending && busyId === r.id}
                      className="wp-btn-sm disabled:opacity-50"
                    >
                      <X size={13} /> Decline
                    </button>
                    <button
                      onClick={() => decide(r.id, true)}
                      disabled={pending && busyId === r.id}
                      data-tone="accent"
                      className="wp-btn-sm disabled:opacity-50"
                    >
                      <Check size={13} /> Approve
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Roster */}
      <section className="wp-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Users size={17} className="text-ember" strokeWidth={1.7} />
            <h2 className="wp-section-title">Roster</h2>
            <span className="text-sm text-text-tertiary">{travelers.length} invited</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="wp-seg">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  data-active={filter === f.id}
                  className="wp-seg-item"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAddingOpen((o) => !o)}
              className="wp-btn-sm"
              data-tone={addingOpen ? undefined : "accent"}
            >
              {addingOpen ? <X size={13} /> : <UserPlus size={13} />}
              {addingOpen ? "Close" : "Add travelers"}
            </button>
          </div>
        </div>

        {addingOpen && (
          <div className="mt-5 space-y-3">
            <TravelerPicker
              selectedIds={pickIds}
              onToggle={(id) =>
                setPickIds((ids) =>
                  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
                )
              }
              adHoc={pickNew}
              onAddAdHoc={(t) =>
                setPickNew((list) =>
                  list.some((x) => x.email.toLowerCase() === t.email.toLowerCase()) ||
                  onTrip.has(t.email.toLowerCase())
                    ? list
                    : [...list, t],
                )
              }
              onRemoveAdHoc={(email) =>
                setPickNew((list) => list.filter((x) => x.email !== email))
              }
            />
            <div className="flex items-center gap-3">
              <button
                onClick={commitAdditions}
                disabled={pending || pickIds.length + pickNew.length === 0}
                className="wp-cta px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending
                  ? "Adding…"
                  : `Add ${pickIds.length + pickNew.length || ""} to trip`.trim()}
              </button>
              <span className="text-xs text-text-tertiary">
                Anyone already on the trip is skipped.
              </span>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-2">
          {visible.map(({ a, flags, cost }) => {
            const open = expanded === a.id;
            return (
              <div key={a.id} className="wp-card-sunken overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : a.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-4 p-4 text-left transition hover:bg-white/[0.03]"
                >
                  <span className="wp-avatar">{initials(a.name)}</span>

                  <div className="min-w-[10rem] flex-1">
                    <div className="font-medium text-text-primary">{a.name}</div>
                    <div className="text-xs text-text-tertiary">
                      {a.title} · {a.department} · from {a.originAirport}
                    </div>
                    {flags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {flags.map((f) => (
                          <span
                            key={f.kind}
                            title={f.detail}
                            className={`wp-badge ${f.severity === "err" ? "wp-badge-err" : "wp-badge-warn"}`}
                          >
                            {f.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className={`wp-badge ${RSVP_TONE[a.rsvp]}`}>{RSVP_LABEL[a.rsvp]}</span>
                  <span className={`wp-badge ${TRAVEL_TONE[a.travelStatus]}`}>
                    {TRAVEL_LABEL[a.travelStatus]}
                  </span>
                  <span className="w-24 text-right font-medium tabular-nums text-text-primary">
                    {cost.totalUsd > 0 ? (
                      usd(cost.totalUsd)
                    ) : (
                      <span className="text-xs font-normal text-warn">Not quoted</span>
                    )}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-white/8 bg-black/20 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      {[a.inbound, a.outbound].map((legDetail, i) =>
                        legDetail ? (
                          <div key={i} className="rounded-lg border border-white/8 p-3.5">
                            <div className="flex items-center gap-2">
                              <Plane
                                size={13}
                                className={`text-ember ${i === 1 ? "rotate-180" : ""}`}
                              />
                              <span className="text-xs uppercase tracking-[0.14em] text-text-tertiary">
                                {i === 0 ? "Outbound" : "Return"}
                              </span>
                            </div>

                            <div className="mt-2 font-medium text-text-primary">
                              {legDetail.carrier} {legDetail.flightNo}
                            </div>

                            {/* Date is always shown with the time. */}
                            <div className="mt-1 text-sm text-text-secondary">
                              {fmtLegTiming(legDetail.depart, legDetail.arrive)}
                            </div>

                            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                              <Detail
                                label="Route"
                                value={`${legDetail.origin} → ${legDetail.destination}`}
                              />
                              <Detail
                                label="Terminal"
                                value={
                                  legDetail.originTerminal || legDetail.destinationTerminal
                                    ? `${legDetail.originTerminal ?? "—"} → ${legDetail.destinationTerminal ?? "—"}`
                                    : undefined
                                }
                              />
                              <Detail label="Cabin" value={cabinLabel(legDetail.cabin)} />
                              <Detail
                                label="Duration"
                                value={fmtDuration(
                                  Math.round(
                                    (legDetail.arrive.getTime() - legDetail.depart.getTime()) / 60_000,
                                  ),
                                )}
                              />
                              <Detail label="Gate" value={legDetail.gate} />
                              <Detail label="Aircraft" value={legDetail.aircraftName} />
                              <Detail label="Fare" value={usd(legDetail.priceUsd)} />
                              <Detail label="Booking ref" value={legDetail.confirmationCode} />
                            </dl>
                          </div>
                        ) : null,
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                      <div className="rounded-lg border border-white/8 p-3.5">
                        <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">
                          Lodging
                        </div>
                        {a.roomBlockId ? (
                          <>
                            <div className="mt-1.5 font-medium text-text-primary">
                              {blockName.get(a.roomBlockId)}
                            </div>
                            <div className="mt-1 text-text-secondary tabular-nums">
                              {a.nightlyRateUsd
                                ? `${usd(a.nightlyRateUsd)}/night · ${a.nights} nights · ${usd(a.nightlyRateUsd * (a.nights ?? 0))} total`
                                : `${a.nights ?? "?"} nights · rate not quoted`}
                            </div>
                          </>
                        ) : (
                          <div className="mt-1.5 text-text-tertiary">No room assigned</div>
                        )}
                      </div>

                      <div className="rounded-lg border border-white/8 p-3.5">
                        <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">
                          Traveler profile
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {[...(a.dietary ?? []), ...(a.accessibility ?? [])].map((n) => (
                            <span key={n} className="wp-badge wp-badge-neutral">{n}</span>
                          ))}
                          {a.seatPreference && (
                            <span className="wp-badge wp-badge-neutral">
                              {a.seatPreference} seat
                            </span>
                          )}
                          {a.airlinePreference && (
                            <span className="wp-badge wp-badge-neutral">
                              prefers {a.airlinePreference}
                            </span>
                          )}
                          {!a.dietary?.length &&
                            !a.accessibility?.length &&
                            !a.seatPreference &&
                            !a.airlinePreference && (
                              <span className="text-text-tertiary">None recorded</span>
                            )}
                        </div>

                        {/* Loyalty and KTN travel with the person, not the trip. */}
                        {(a.loyaltyNumbers || a.knownTravelerNumber) && (
                          <dl className="mt-2.5 space-y-0.5">
                            {Object.entries(a.loyaltyNumbers ?? {}).map(([prog, num]) => (
                              <div key={prog} className="flex gap-2">
                                <dt className="text-text-tertiary">{prog}</dt>
                                <dd className="font-mono text-text-secondary">{num}</dd>
                              </div>
                            ))}
                            {a.knownTravelerNumber && (
                              <div className="flex gap-2">
                                <dt className="text-text-tertiary">KTN</dt>
                                <dd className="font-mono text-text-secondary">
                                  {a.knownTravelerNumber}
                                </dd>
                              </div>
                            )}
                          </dl>
                        )}

                        {a.deviationNote && (
                          <p className="mt-2 text-text-secondary">{a.deviationNote}</p>
                        )}

                        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-white/8 pt-2.5">
                          <span className="truncate text-text-tertiary">
                            {a.email}
                            {a.homeCity ? ` · ${a.homeCity}` : ""}
                          </span>
                          <button
                            onClick={() => removeTraveler(a.id)}
                            disabled={pending && busyId === a.id}
                            className="wp-btn-sm shrink-0 disabled:opacity-50"
                          >
                            <X size={12} /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {visible.length === 0 && (
          <p className="py-8 text-center text-sm text-text-tertiary">
            No travelers match this filter.
          </p>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="text-text-secondary">{value ?? "—"}</dd>
    </div>
  );
}
