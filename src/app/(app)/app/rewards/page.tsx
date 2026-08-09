import Link from "next/link";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";
import { valueRewards } from "@/lib/tools/rewards/valuation";
import { scoreTripOptions, type TripOption } from "@/lib/agents/pricing";
import PageAsciiHero from "@/components/app/PageAsciiHero";

function nightsOf(start: Date | null | undefined, end: Date | null | undefined): number {
  if (!start || !end) return 4;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export default async function RewardsPage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();

  const rows = trips.map((trip) => {
    const spend =
      Number(trip.budgets?.[0]?.actual ?? 0) ||
      Number(trip.budgets?.[0]?.totalBudget ?? 0) ||
      0;
    const budget =
      Number(trip.budgets?.[0]?.totalBudget ?? 0) || Math.max(spend, 2500);
    const days = nightsOf(
      trip.startDate ? new Date(trip.startDate) : null,
      trip.endDate ? new Date(trip.endDate) : null,
    );
    const meta = isMemoryGraph() ? demoStore.getTripMeta(trip.id) : {};
    const storedOptions = (meta?.roveOptions as TripOption[] | undefined) ?? null;
    const storedPick = (meta?.rovePick as TripOption | undefined) ?? null;
    const options =
      storedOptions?.length
        ? storedOptions
        : scoreTripOptions(trip.destination || "Destination", days, budget);
    const pick = storedPick ?? options[0] ?? null;
    const valuation = valueRewards(spend > 0 ? spend : pick?.cashUsd ?? budget * 0.88);
    return { trip, spend, budget, days, options, pick, valuation };
  });

  const portfolioSpend = rows.reduce(
    (s, r) => s + (r.spend > 0 ? r.spend : r.pick?.cashUsd ?? 0),
    0,
  );
  const portfolio = valueRewards(portfolioSpend || 900);
  const featured = rows[0] ?? null;

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="rewards"
        eyebrow="Rove × WAYPORT"
        title="Rewards"
        subtitle="Miles earned on graph spend, and how Rove scored each trip shape before we wrote the Travel Graph."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Portfolio cash" value={money(portfolioSpend || portfolio.effectiveCostUsd)} />
        <Stat
          label="Rove miles"
          value={portfolio.roveMiles.toLocaleString()}
          hint="12 mi per $1 spent"
          accent
        />
        <Stat
          label="Card + loyalty pts"
          value={(portfolio.creditCardPoints + portfolio.loyaltyPoints).toLocaleString()}
        />
        <Stat
          label="Effective cost"
          value={money(portfolio.effectiveCostUsd)}
          hint={portfolio.story}
          accent
        />
      </section>

      <section className="wp-card space-y-3 p-6">
        <p className="wp-eyebrow">How Rove values a dollar</p>
        <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
          <p>
            <span className="font-medium text-text-primary">Rove miles</span> — 12 mi / $ ·
            valued at 1.2¢ each
          </p>
          <p>
            <span className="font-medium text-text-primary">Card points</span> — 3× cash ·
            valued at 1.8¢
          </p>
          <p>
            <span className="font-medium text-text-primary">Loyalty</span> — 5× cash ·
            valued at 1.3¢
          </p>
        </div>
      </section>

      {featured && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="wp-eyebrow">Optimization</p>
              <h2 className="font-display mt-1 text-xl font-semibold tracking-tight">
                How Rove scored {featured.trip.title}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Three trip shapes for {featured.trip.destination} · {featured.days} nights ·
                budget {money(featured.budget)}. Winner written into the Travel Graph.
              </p>
            </div>
            <Link
              href={`/app/trips/${featured.trip.id}`}
              className="wp-btn-sm"
              data-tone="accent"
            >
              Open trip
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {featured.options.map((o) => {
              const winner = featured.pick?.id === o.id;
              return (
                <article
                  key={o.id}
                  className={`wp-card p-5 ${
                    winner ? "ring-1 ring-ember/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-text-primary">{o.label}</h3>
                    {winner && (
                      <span className="wp-badge wp-badge-ok shrink-0">Selected</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-text-tertiary">{o.why}</p>
                  <dl className="mt-4 space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-tertiary">Cash</dt>
                      <dd>{money(o.cashUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-tertiary">Rove mi</dt>
                      <dd className="text-ember">{o.roveMiles.toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-tertiary">Effective</dt>
                      <dd>{money(o.effectiveUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-tertiary">Score</dt>
                      <dd>{o.score}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <p className="wp-eyebrow">Across your trips</p>
          <h2 className="font-display mt-1 text-xl font-semibold tracking-tight">
            Miles by itinerary
          </h2>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            Create a trip to see Rove optimization and earned miles.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ trip, spend, pick, valuation, options }) => (
              <li key={trip.id} className="wp-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/app/trips/${trip.id}`}
                      className="font-medium text-text-primary hover:text-ember"
                    >
                      {trip.title}
                    </Link>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {trip.destination}
                      {pick ? ` · optimized as ${pick.label}` : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right font-mono text-xs">
                    <div>
                      <div className="text-text-tertiary">Spend</div>
                      <div className="mt-0.5 text-sm text-text-primary">
                        {money(spend > 0 ? spend : pick?.cashUsd ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-tertiary">Rove mi</div>
                      <div className="mt-0.5 text-sm text-ember">
                        {valuation.roveMiles.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-tertiary">Effective</div>
                      <div className="mt-0.5 text-sm text-text-primary">
                        {money(valuation.effectiveCostUsd)}
                      </div>
                    </div>
                  </div>
                </div>
                {pick && (
                  <p className="mt-3 border-t border-white/8 pt-3 text-xs text-text-secondary">
                    Rove compared {options.length} shapes and picked{" "}
                    <span className="text-text-primary">{pick.label}</span> —{" "}
                    {pick.roveMiles.toLocaleString()} mi at {money(pick.effectiveUsd)}{" "}
                    effective ({pick.why})
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="wp-card p-5">
      <div className="wp-eyebrow">{label}</div>
      <div
        className={`mt-2 text-2xl font-semibold tracking-tight ${
          accent ? "text-ember" : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}
