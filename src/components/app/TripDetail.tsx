"use client";

import Link from "next/link";
import { cn, formatCurrency } from "@/lib/utils";
import QualityPanel from "@/components/app/QualityPanel";
import BookingReview from "@/components/app/BookingReview";
import VoiceDemo from "@/components/app/VoiceDemo";
import TripEditPanel from "@/components/app/TripEditPanel";
import RiskAwarePanel from "@/components/app/RiskAwarePanel";
import DecisionTracePanel from "@/components/app/DecisionTracePanel";
import DecisionGraph from "@/components/graph/DecisionGraph";
import type { NormalizedOffer } from "@/lib/tools/providers/booking";
import type { RiskDecision } from "@/lib/decision/risk";
import type { DecisionTrace } from "@/lib/decision/transparency";
import { useEffect, useState } from "react";
import { day0DinnerRiskDecision } from "@/lib/decision/risk";

type Item = {
  id: string;
  kind: string;
  title: string;
  status: string;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  location?: string | null;
  payload?: {
    priceUsd?: number;
    description?: string;
    whatToDo?: string[];
    notes?: string;
    // Transport / stay specifics, surfaced verbatim on the item.
    airline?: string;
    flightNumber?: string;
    originTerminal?: string;
    destinationTerminal?: string;
    gate?: string;
    seat?: string;
    aircraft?: string;
    hotelName?: string;
    address?: string;
    roomType?: string;
    checkIn?: string;
    checkOut?: string;
    confirmationCode?: string;
    provider?: string;
    attendeeCount?: number;
  } | null;
};

type Action = {
  id: string;
  agent: string;
  action: string;
  tool?: string;
  createdAt: string | Date;
  status: string;
};

type Trip = {
  id: string;
  title: string;
  destination: string;
  mode: string;
  status: string;
  budgets?: { totalBudget: number; actual: number; remaining: number; currency: string }[];
  items: Item[];
  alerts: { id: string; title: string; body: string; severity: string }[];
};

export default function TripDetail({
  trip,
  actions = [],
  meta = {},
}: {
  trip: Trip;
  actions?: Action[];
  meta?: Record<string, unknown>;
}) {
  const [tab, setTab] = useState<"itinerary" | "graph" | "quality" | "activity" | "money" | "alerts" | "book">("itinerary");
  const [openId, setOpenId] = useState<string | null>(null);
  const [hotelOffers, setHotelOffers] = useState<NormalizedOffer[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const budget = trip.budgets?.[0] ?? { totalBudget: 2500, actual: 0, remaining: 2500, currency: "USD" };
  const itemTotal = trip.items.reduce((s, it) => s + Number(it.payload?.priceUsd ?? 0), 0);
  const grandTotal = itemTotal || Number(budget.actual) || 0;
  const risk = (meta.risk as RiskDecision | undefined) ?? day0DinnerRiskDecision();
  const hotelDecision = meta.hotelDecision as DecisionTrace | undefined;
  const localDecision = meta.localDecision as DecisionTrace | undefined;

  useEffect(() => {
    if (tab !== "book") return;
    fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search",
        tripId: trip.id,
        kind: "hotel",
        params: { destination: trip.destination },
      }),
    })
      .then((r) => r.json())
      .then((d) => setHotelOffers(d.offers ?? []));
  }, [tab, trip.id, trip.destination]);

  async function shareTrip() {
    setShareBusy(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setShareUrl(data.url);
        setMarkdown(data.markdown);
      }
    } finally {
      setShareBusy(false);
    }
  }

  const hotelTitle = trip.items.find((i) => i.kind === "HOTEL")?.title;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="wp-eyebrow">{trip.destination}</p>
          <h1 className="font-display mt-2 text-4xl">{trip.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className={cn("rounded-full px-3 py-1", trip.mode === "LIVE" ? "bg-ok/10 text-ok" : "bg-white/10 text-text-secondary")}>
              {trip.mode}
            </span>
            <span className="text-text-tertiary">{trip.items.length} items</span>
            <span className="rounded-full bg-ember/15 px-3 py-1 text-ember">
              Grand total {formatCurrency(grandTotal)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={shareTrip} disabled={shareBusy} className="wp-cta-ghost px-4 py-2 text-sm disabled:opacity-50">
            {shareBusy ? "Sharing…" : "Share / export"}
          </button>
          <Link href={`/app?tripId=${encodeURIComponent(trip.id)}`} className="wp-cta px-4 py-2 text-sm">
            Map OS
          </Link>
          <Link href="/app/trips/new" className="wp-cta-ghost px-4 py-2 text-sm">
            Concierge
          </Link>
        </div>
      </header>

      {shareUrl && (
        <div className="wp-card rounded-2xl p-4 text-sm">
          <div className="wp-eyebrow">Shareable proposal</div>
          <a href={shareUrl} className="mt-2 block break-all text-ember" target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
          {markdown && (
            <details className="mt-3">
              <summary className="cursor-pointer text-text-tertiary">Markdown export</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-text-secondary">{markdown}</pre>
            </details>
          )}
        </div>
      )}

      <VoiceDemo tripId={trip.id} hotelName={hotelTitle} />

      <TripEditPanel tripId={trip.id} />

      <RiskAwarePanel risk={risk} />

      {(hotelDecision || localDecision) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {hotelDecision && <DecisionTracePanel decision={hotelDecision} />}
          {localDecision && <DecisionTracePanel decision={localDecision} />}
        </div>
      )}

      <nav className="flex flex-wrap gap-2 border-b border-white/10">
        {(["itinerary", "graph", "quality", "book", "activity", "money", "alerts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm capitalize",
              tab === t ? "border-ember text-white" : "border-transparent text-text-secondary hover:text-white",
            )}
          >
            {t === "graph" ? "3D Graph" : t}
          </button>
        ))}
      </nav>

      {tab === "graph" && <DecisionGraph trip={trip} />}

      {tab === "quality" && <QualityPanel tripId={trip.id} />}

      {tab === "book" && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Real/search inventory → review → policy check → <strong className="text-white">mock</strong> transaction → graph update.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {hotelOffers.map((o) => (
              <div key={o.id} className="wp-card rounded-2xl p-4 text-sm">
                <div className="font-medium">{o.title}</div>
                <div className="mt-1 text-ember">{formatCurrency(o.priceUsd)}</div>
                {o.effective && (
                  <div className="text-xs text-text-tertiary">Effective {formatCurrency(o.effective.effectiveUsd)}</div>
                )}
              </div>
            ))}
          </div>
          {hotelOffers[0] && <BookingReview tripId={trip.id} offer={hotelOffers[0]} />}
        </div>
      )}

      {tab === "itinerary" && (
        <div className="space-y-4">
          {trip.items.length === 0 ? (
            <div className="wp-card rounded-2xl p-10 text-center text-text-secondary">No itinerary items yet.</div>
          ) : (
            groupByDay(trip.items).map(([dayKey, dayItems], dayIndex) => (
              <section key={dayKey} className="space-y-3">
                {/* Day header — every time below is anchored to this date. */}
                <div className="flex items-baseline gap-3">
                  <h3 className="font-display text-sm font-semibold tracking-wide">
                    {dayKey === "unscheduled"
                      ? "Unscheduled"
                      : `Day ${dayIndex + 1} · ${fmtDayHeading(dayKey)}`}
                  </h3>
                  <span className="text-xs text-text-tertiary">
                    {dayItems.length} {dayItems.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <ol className="space-y-3">
                  {dayItems.map((item) => {
                    const price = item.payload?.priceUsd;
                    const open = openId === item.id;
                    const detail = itemDetails(item);
                    return (
                      <li key={item.id} className="wp-card overflow-hidden rounded-2xl">
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? null : item.id)}
                          className="grid w-full gap-3 p-5 text-left md:grid-cols-[auto,1fr,auto,auto] md:items-center"
                        >
                          <div className="min-w-[6.5rem] font-mono text-sm text-text-tertiary">
                            {item.startTime ? (
                              <>
                                <div className="text-text-secondary">
                                  {fmtClock(item.startTime)}
                                  {item.endTime ? `–${fmtClock(item.endTime)}` : ""}
                                </div>
                                <div className="text-[11px]">{fmtShortDay(item.startTime)}</div>
                              </>
                            ) : (
                              "--:--"
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{item.title}</div>
                            <div className="mt-1 text-xs text-text-tertiary">
                              {item.kind}
                              {item.location ? ` · ${item.location}` : ""}
                            </div>
                            {detail.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
                                {detail.map((d) => (
                                  <span key={d.label}>
                                    <span className="text-text-secondary">{d.label}</span> {d.value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-ember">
                            {price != null ? formatCurrency(price) : "—"}
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-xs",
                              item.status === "CONFIRMED"
                                ? "bg-ok/10 text-ok"
                                : item.status === "CANCELLED" || item.status === "DISRUPTED"
                                  ? "bg-err/10 text-err"
                                  : "bg-white/10 text-text-secondary",
                            )}
                          >
                            {item.status.toLowerCase()}
                          </span>
                        </button>
                        {open && (
                          <div className="border-t border-white/10 bg-black/20 px-5 py-4 text-sm text-text-secondary">
                            {/* Full timing, spelled out with the date on both ends. */}
                            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 md:grid-cols-3">
                              {item.startTime && (
                                <DetailRow label="Starts" value={fmtFull(item.startTime)} />
                              )}
                              {item.endTime && (
                                <DetailRow label="Ends" value={fmtFull(item.endTime)} />
                              )}
                              {item.location && (
                                <DetailRow label="Location" value={item.location} />
                              )}
                              {itemDetails(item).map((d) => (
                                <DetailRow key={d.label} label={d.label} value={d.value} />
                              ))}
                              {price != null && (
                                <DetailRow label="Price" value={formatCurrency(price)} />
                              )}
                              <DetailRow label="Status" value={item.status.toLowerCase()} />
                            </dl>

                            {item.payload?.description && (
                              <p className="mt-4">{item.payload.description}</p>
                            )}
                            {item.payload?.whatToDo && item.payload.whatToDo.length > 0 && (
                              <div className="mt-3">
                                <div className="wp-eyebrow mb-2">What you can do</div>
                                <ul className="space-y-1.5">
                                  {item.payload.whatToDo.map((t, i) => (
                                    <li key={i} className="flex gap-2">
                                      <span className="text-ember">·</span>
                                      {t}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {item.payload?.notes && (
                              <p className="mt-3 text-xs text-text-tertiary">
                                Note · {item.payload.notes}
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          )}

          <div className="wp-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
            <div>
              <div className="wp-eyebrow">Grand total</div>
              <div className="mt-1 text-2xl font-semibold text-ember">{formatCurrency(grandTotal)}</div>
            </div>
            <div className="text-right text-xs text-text-tertiary">
              Sum of priced events
              <br />
              Budget remaining {formatCurrency(Number(budget.remaining))}
            </div>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="wp-card space-y-3 rounded-2xl p-6">
          <div className="wp-eyebrow">Live Agent Activity</div>
          <ul className="space-y-2 font-mono text-sm text-text-secondary">
            {actions.length === 0 ? (
              <li>No actions logged yet.</li>
            ) : (
              actions.map((a) => (
                <li key={a.id}>
                  {new Date(a.createdAt).toLocaleTimeString()} — <span className="text-ember">{a.agent}</span> · {a.action}
                  {a.tool ? ` (${a.tool})` : ""}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {tab === "money" && (
        <div className="grid gap-4 md:grid-cols-3">
          <MoneyCard label="Budget" value={formatCurrency(Number(budget.totalBudget), budget.currency)} />
          <MoneyCard label="Event total" value={formatCurrency(grandTotal, budget.currency)} />
          <MoneyCard label="Remaining" value={formatCurrency(Number(budget.remaining), budget.currency)} highlight />
        </div>
      )}

      {tab === "alerts" && (
        <div className="space-y-4">
          {trip.alerts.length === 0 ? (
            <div className="wp-card rounded-2xl p-10 text-center text-text-secondary">All clear.</div>
          ) : (
            trip.alerts.map((a) => (
              <div key={a.id} className="wp-card rounded-2xl p-5">
                <div className="font-medium">{a.title}</div>
                <div className="mt-1 text-sm text-text-secondary">{a.body}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Itinerary helpers ───────────────────────────────────────── */

const CLOCK = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});
const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const FULL = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});
const DAY_HEADING = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function fmtClock(d: string | Date) {
  return CLOCK.format(new Date(d));
}
function fmtShortDay(d: string | Date) {
  return SHORT_DAY.format(new Date(d));
}
/** Full date + time — used wherever a bare clock reading would be ambiguous. */
function fmtFull(d: string | Date) {
  return FULL.format(new Date(d));
}
function fmtDayHeading(key: string) {
  return DAY_HEADING.format(new Date(`${key}T00:00:00Z`));
}

/**
 * Buckets items by calendar day (UTC) so the timeline reads as Day 1 / Day 2
 * rather than an undifferentiated list of clock times.
 */
function groupByDay(items: Item[]): [string, Item[]][] {
  const buckets = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.startTime
      ? new Date(item.startTime).toISOString().slice(0, 10)
      : "unscheduled";
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  for (const list of buckets.values()) {
    list.sort(
      (a, b) =>
        new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime(),
    );
  }
  return [...buckets.entries()].sort(([a], [b]) =>
    a === "unscheduled" ? 1 : b === "unscheduled" ? -1 : a.localeCompare(b),
  );
}

/** Kind-specific facts worth showing without expanding the row. */
function itemDetails(item: Item): { label: string; value: string }[] {
  const p = item.payload;
  if (!p) return [];
  const out: { label: string; value: string }[] = [];
  const add = (label: string, value?: string | number) => {
    if (value !== undefined && value !== null && value !== "") {
      out.push({ label, value: String(value) });
    }
  };

  if (item.kind === "FLIGHT") {
    add("Flight", [p.airline, p.flightNumber].filter(Boolean).join(" "));
    if (p.originTerminal || p.destinationTerminal) {
      add("Terminal", `${p.originTerminal ?? "—"} → ${p.destinationTerminal ?? "—"}`);
    }
    add("Gate", p.gate);
    add("Seat", p.seat);
    add("Aircraft", p.aircraft);
  } else if (item.kind === "HOTEL") {
    add("Hotel", p.hotelName);
    add("Address", p.address);
    add("Room", p.roomType);
    add("Check-in", p.checkIn);
    add("Check-out", p.checkOut);
  } else {
    add("Attendees", p.attendeeCount);
  }

  add("Confirmation", p.confirmationCode);
  add("Provider", p.provider);
  return out;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.12em] text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-text-secondary">{value}</dd>
    </div>
  );
}

function MoneyCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("wp-card rounded-2xl p-5", highlight && "border-ember/40")}>
      <div className="wp-eyebrow">{label}</div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}
