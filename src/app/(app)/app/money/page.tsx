import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { formatCurrency } from "@/lib/utils";
import { getRate } from "@/lib/tools/currency/fx";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function MoneyPage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();
  const fx = await getRate("USD", "JPY");

  const rows = trips.map((t: any) => {
    const b = t.budgets?.[0] ?? { totalBudget: 0, actual: 0, remaining: 0, currency: "USD" };
    return { id: t.id, title: t.title, destination: t.destination, ...b };
  });

  const total = rows.reduce((s, r) => s + Number(r.totalBudget), 0);
  const spent = rows.reduce((s, r) => s + Number(r.actual), 0);

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="money"
        eyebrow="You"
        title="Money"
        subtitle="Budgets across the Travel Graph · FX via Currency agent."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card label="Total planned" value={formatCurrency(total)} />
        <Card label="Spent" value={formatCurrency(spent)} />
        <Card label={`USD → JPY`} value={fx.rate.toFixed(2)} hint="Live/fallback rate" />
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="wp-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
            <div>
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-text-tertiary">{r.destination}</div>
            </div>
            <div className="text-right text-sm">
              <div>{formatCurrency(Number(r.remaining))} left</div>
              <div className="text-xs text-text-tertiary">of {formatCurrency(Number(r.totalBudget))}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="wp-card rounded-2xl p-5">
      <div className="wp-eyebrow">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-text-tertiary">{hint}</div>}
    </div>
  );
}
