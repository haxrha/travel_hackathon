import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function AlertsPage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();
  const alerts = (
    await Promise.all(
      trips.map(async (t: any) => {
        const full = await new TravelGraph(userId).getTrip({ tripId: t.id });
        return ((full as any)?.alerts ?? []).map((a: any) => ({ ...a, tripId: t.id, tripTitle: t.title }));
      }),
    )
  ).flat();

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="alerts"
        eyebrow="Live"
        title="Alerts"
        subtitle="Guardian signals across every trip on the graph."
      />

      {alerts.length === 0 ? (
        <div className="wp-card rounded-2xl p-10 text-center text-text-secondary">All clear.</div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a: any) => (
            <div key={a.id} className="wp-card rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="wp-eyebrow">{a.tripTitle}</div>
                  <div className="mt-1 font-medium">{a.title}</div>
                  <p className="mt-1 text-sm text-text-secondary">{a.body}</p>
                </div>
                <Link href={`/app/trips/${a.tripId}`} className="wp-cta-ghost px-3 py-1.5 text-xs">
                  View trip
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-text-tertiary">
        Tip: fire a disruption from Sandbox to watch Guardian update the graph. Budget context:{" "}
        {trips[0]?.budgets?.[0] ? formatCurrency(Number(trips[0].budgets[0].remaining)) : "n/a"} remaining on primary trip.
      </p>
    </div>
  );
}
