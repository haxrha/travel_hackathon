import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { valueRewards } from "@/lib/tools/rewards/valuation";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function RewardsPage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();
  const samplePrice = Number(trips[0]?.budgets?.[0]?.actual ?? 1180) || 900;
  const valuation = valueRewards(samplePrice);

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="rewards"
        eyebrow="You"
        title="Rewards"
        subtitle="Effective cost after miles & points — tied to graph spend."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="wp-card rounded-2xl p-5">
          <div className="wp-eyebrow">Cash spend</div>
          <div className="mt-2 text-2xl font-semibold">${samplePrice}</div>
        </div>
        <div className="wp-card rounded-2xl p-5">
          <div className="wp-eyebrow">Rove miles est.</div>
          <div className="mt-2 text-2xl font-semibold">{valuation.roveMiles.toLocaleString()}</div>
        </div>
        <div className="wp-card rounded-2xl p-5">
          <div className="wp-eyebrow">Effective cost</div>
          <div className="mt-2 text-2xl font-semibold text-ember">${valuation.effectiveCostUsd.toFixed(0)}</div>
        </div>
      </div>

      <div className="wp-card rounded-2xl p-6 text-sm text-text-secondary">
        Valuation blends Rove miles, credit-card points, and loyalty currency estimated from graph actuals on{" "}
        <span className="text-white">{trips[0]?.title ?? "your trip"}</span>.
      </div>
    </div>
  );
}
