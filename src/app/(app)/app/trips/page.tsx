import Link from "next/link";
import { MapPin, PlaneTakeoff, Plus, Users } from "lucide-react";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";
import { formatCurrency } from "@/lib/utils";
import PageAsciiHero from "@/components/app/PageAsciiHero";
import { initials, PURPOSE_LABEL } from "@/lib/enterprise/program";

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "wp-badge-ok",
  CONFIRMED: "wp-badge-ok",
  PLANNING: "wp-badge-accent",
  DRAFT: "wp-badge-neutral",
  COMPLETED: "wp-badge-neutral",
  CANCELLED: "wp-badge-err",
};

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Shape this page needs from TravelGraph — Prisma and the demo store both satisfy it. */
type TripRow = {
  id: string;
  title: string;
  destination: string;
  origin?: string | null;
  status: string;
  startDate?: Date | null;
  endDate?: Date | null;
  items?: unknown[];
  budgets?: { totalBudget: unknown; actual: unknown; remaining: unknown }[];
  _count?: { items?: number; alerts?: number };
};

function range(a?: Date | null, b?: Date | null) {
  if (!a) return "Dates not set";
  return b ? `${DAY_FMT.format(a)} – ${DAY_FMT.format(b)}` : DAY_FMT.format(a);
}

export default async function TripsPage() {
  const userId = await requireUserId();
  const trips = (await new TravelGraph(userId).listTrips()) as unknown as TripRow[];
  // Coordination lives on the in-memory trip, so pair it back up by id.
  const coordById = new Map(
    (isMemoryGraph() ? demoStore.listCoordinatedTrips() : []).map((t) => [
      t.id,
      t.coordination!,
    ]),
  );

  return (
    <div className="space-y-6">
      <PageAsciiHero
        variant="trips"
        eyebrow="Trip"
        title="Trips"
        subtitle="Every journey on your Travel Graph."
        actions={
          <Link
            href="/app/trips/new"
            className="wp-cta inline-flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            <Plus size={15} /> New trip
          </Link>
        }
      />

      {trips.length === 0 ? (
        <div className="wp-card p-12 text-center">
          <h2 className="font-display text-xl font-semibold">No trips yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
            Describe where you&apos;re going and the Concierge will build the itinerary.
          </p>
          <Link href="/app/trips/new" className="wp-cta mt-6 inline-flex px-6 py-3 text-sm">
            Start with Concierge
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {trips.map((t) => {
            const budget = t.budgets?.[0];
            const total = Number(budget?.totalBudget ?? 0);
            const actual = Number(budget?.actual ?? 0);
            const pct = total > 0 ? Math.min(100, Math.round((actual / total) * 100)) : 0;
            const alerts = t._count?.alerts ?? 0;
            const coord = coordById.get(t.id);
            const party = coord?.travelers.filter((x) => x.rsvp !== "DECLINED") ?? [];
            const pendingApprovals =
              coord?.approvals.filter((a) => a.status === "PENDING").length ?? 0;

            return (
              <div key={t.id} className="wp-card wp-card-interactive p-6">
                <Link href={`/app/trips/${t.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {coord ? (
                          <span className="wp-badge wp-badge-accent">
                            {PURPOSE_LABEL[coord.purpose]}
                          </span>
                        ) : (
                          <span className="wp-badge wp-badge-neutral">Solo</span>
                        )}
                        {coord?.costCenter && (
                          <span className="wp-badge wp-badge-neutral">{coord.costCenter}</span>
                        )}
                      </div>
                      <h2 className="font-display mt-2.5 truncate text-xl font-semibold">
                        {t.title}
                      </h2>
                      <p className="mt-1 text-sm text-text-tertiary">
                        {range(t.startDate, t.endDate)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} /> {t.destination}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <PlaneTakeoff size={11} /> {t.origin ?? "Origin not set"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users size={11} /> {party.length || 1}{" "}
                          {(party.length || 1) === 1 ? "traveler" : "travelers"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`wp-badge ${STATUS_TONE[t.status] ?? "wp-badge-neutral"}`}>
                        {t.status}
                      </span>
                      {alerts > 0 && (
                        <span className="wp-badge wp-badge-warn">{alerts} alert{alerts === 1 ? "" : "s"}</span>
                      )}
                      {pendingApprovals > 0 && (
                        <span className="wp-badge wp-badge-err">
                          {pendingApprovals} approval{pendingApprovals === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  {total > 0 && (
                    <div className="mt-5">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-text-tertiary">
                          {formatCurrency(actual)} of {formatCurrency(total)}
                        </span>
                        <span className="tabular-nums text-text-tertiary">{pct}%</span>
                      </div>
                      <div className="wp-progress mt-1.5">
                        <div
                          className="wp-progress-fill"
                          data-tone={pct > 95 ? "err" : pct > 80 ? "warn" : "ok"}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/8 pt-4 text-xs text-text-tertiary">
                    <div className="flex items-center gap-4">
                      <span>{t._count?.items ?? t.items?.length ?? 0} items</span>
                      {budget && <span>{formatCurrency(Number(budget.remaining))} left</span>}
                    </div>
                    {party.length > 0 && (
                      <div className="wp-avatar-stack">
                        {party.slice(0, 5).map((a) => (
                          <span
                            key={a.id}
                            className="wp-avatar !h-7 !w-7 !text-[10px]"
                            title={a.name}
                          >
                            {initials(a.name)}
                          </span>
                        ))}
                        {party.length > 5 && (
                          <span className="wp-avatar !h-7 !w-7 !text-[10px]">
                            +{party.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/app?tripId=${encodeURIComponent(t.id)}`}
                    className="wp-btn-sm inline-flex items-center gap-1.5"
                    data-tone="accent"
                  >
                    <MapPin size={13} /> Open Map OS
                  </Link>
                  <Link href={`/app/trips/${t.id}`} className="wp-btn-sm inline-flex">
                    Trip detail
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
