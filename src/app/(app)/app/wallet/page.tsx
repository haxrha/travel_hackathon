import { requireUserId } from "@/server/auth";
import { demoStore } from "@/lib/demo/store";
import { TravelGraph } from "@/lib/graph/service";
import Link from "next/link";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function WalletPage() {
  const userId = await requireUserId();
  const docs = demoStore.listInbox(userId);
  const trips = await new TravelGraph(userId).listTrips();
  const confirmations = trips.flatMap((t: any) =>
    (t.items ?? []).filter((i: any) => i.status === "CONFIRMED").map((i: any) => ({ ...i, tripId: t.id, tripTitle: t.title })),
  );

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="wallet"
        eyebrow="Live"
        title="Travel Wallet"
        subtitle="Boarding passes, vouchers, and documents linked to the graph."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="wp-card rounded-2xl p-6">
          <div className="wp-eyebrow">Confirmed bookings</div>
          <ul className="mt-4 space-y-3">
            {confirmations.length === 0 ? (
              <li className="text-sm text-text-secondary">No confirmed items yet.</li>
            ) : (
              confirmations.map((c: any) => (
                <li key={c.id} className="flex justify-between gap-3 text-sm">
                  <span>
                    {c.title}
                    <span className="block text-xs text-text-tertiary">{c.kind}</span>
                  </span>
                  <Link href={`/app/trips/${c.tripId}`} className="text-xs text-ember">
                    Open
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="wp-card rounded-2xl p-6">
          <div className="wp-eyebrow">Documents</div>
          <ul className="mt-4 space-y-3">
            {docs.map((d) => (
              <li key={d.id} className="text-sm">
                {d.name}
                <span className="block text-xs text-text-tertiary">{d.extracted.map((e) => e.kind).join(", ")}</span>
              </li>
            ))}
          </ul>
          <Link href="/app/inbox" className="wp-cta-ghost mt-4 inline-flex px-4 py-2 text-xs">
            Upload more
          </Link>
        </div>
      </div>
    </div>
  );
}
