import { requireUserId } from "@/server/auth";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";
import { TravelGraph } from "@/lib/graph/service";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function HospitalityPage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();
  const actions = isMemoryGraph() ? demoStore.listActions(userId, undefined, 12) : [];
  const hotelItems = trips.flatMap((t: any) =>
    (t.items ?? []).filter((i: any) => i.kind === "HOTEL").map((i: any) => ({ ...i, trip: t.title })),
  );

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="hospitality"
        eyebrow="WAYPORT Hospitality"
        title="Hotel Manager"
        subtitle="Guest graph requests mirrored from traveler trips (B2B view)."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Guest trips" value={String(trips.length)} />
        <Stat label="Hotel stays" value={String(hotelItems.length)} />
        <Stat label="Agent actions" value={String(actions.length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="wp-card rounded-2xl p-6">
          <div className="wp-eyebrow">Incoming stays</div>
          <ul className="mt-4 space-y-3 text-sm">
            {hotelItems.length === 0 ? (
              <li className="text-text-secondary">No hotel nodes on the graph yet.</li>
            ) : (
              hotelItems.map((h: any) => (
                <li key={h.id} className="flex justify-between gap-3">
                  <span>
                    {h.title}
                    <span className="block text-xs text-text-tertiary">{h.trip}</span>
                  </span>
                  <span className="text-xs text-ember">{h.status}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="wp-card rounded-2xl p-6">
          <div className="wp-eyebrow">Concierge / agent log</div>
          <ul className="mt-4 space-y-2 font-mono text-xs text-text-secondary">
            {actions.slice(0, 8).map((a) => (
              <li key={a.id}>
                {a.agent} · {a.action}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="wp-card rounded-2xl p-5">
      <div className="wp-eyebrow">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
