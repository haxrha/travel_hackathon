import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import PageAsciiHero from "@/components/app/PageAsciiHero";
import LiveCompanionClient from "@/components/app/LiveCompanionClient";
import Link from "next/link";

export default async function LivePage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();
  const trip = trips[0];

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="explore"
        eyebrow="Live trip mode"
        title="Companion"
        subtitle="Not generic attractions — what you should do right now given graph + world signals."
      />
      {!trip ? (
        <div className="wp-card rounded-2xl p-10 text-center">
          <p className="text-text-secondary">Plan a trip first, then enter Live mode.</p>
          <Link href="/app/trips/new" className="wp-cta mt-4 inline-flex px-5 py-2.5 text-sm">
            Concierge
          </Link>
        </div>
      ) : (
        <LiveCompanionClient tripId={trip.id} destination={trip.destination} />
      )}
    </div>
  );
}
