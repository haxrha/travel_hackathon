import Link from "next/link";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { isDemoMode } from "@/lib/demo";
import WayportMapOS from "@/components/map/WayportMapOS";

type TripRow = { id: string; title: string; destination: string; status: string };

/**
 * Command Center — the live map over one trip's Travel Graph.
 *
 * Accepts `?tripId=` so every trip's map is addressable. Without it the map was
 * pinned to whichever trip happened to sort first, leaving the others with no
 * way to be viewed at all.
 */
export default async function CommandCenter({
  searchParams,
}: {
  searchParams: Promise<{ tripId?: string }>;
}) {
  const userId = await requireUserId();
  const { tripId } = await searchParams;

  let trips: TripRow[] = [];
  try {
    trips = (await new TravelGraph(userId).listTrips()) as unknown as TripRow[];
  } catch {
    trips = [];
  }

  const active =
    (tripId && trips.find((t) => t.id === tripId)) ??
    trips.find((t) => t.status === "ACTIVE") ??
    trips[0];

  if (!active) {
    return (
      <div className="flex h-full min-h-[70vh] items-center justify-center p-10">
        <div className="wp-card max-w-lg rounded-3xl p-10 text-center">
          {isDemoMode() && (
            <p className="mb-4 text-xs text-text-tertiary">Demo mode — graph runs in-memory</p>
          )}
          <h1 className="font-display text-3xl">Command Center</h1>
          <p className="mt-3 text-text-secondary">
            Plan a trip to open the live map OS over your Travel Graph.
          </p>
          <Link href="/app/trips/new" className="wp-cta mt-6 inline-flex px-6 py-3">
            Start with Concierge
          </Link>
        </div>
      </div>
    );
  }

  return (
    <WayportMapOS
      key={active.id}
      tripId={active.id}
      tripTitle={active.title}
      destination={active.destination}
      trips={trips.map((t) => ({ id: t.id, title: t.title, destination: t.destination }))}
    />
  );
}
