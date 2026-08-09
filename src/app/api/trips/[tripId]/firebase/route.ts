import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { demoStore } from "@/lib/demo/store";
import { syncTripToFirestore } from "@/lib/firebase/trips";

/** Manually push a trip's proposal-shaped document to Firestore. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ tripId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { tripId } = await ctx.params;
    const trip = demoStore.getTripById(tripId);
    if (!trip || trip.userId !== userId) {
      // Coordinated demo trips may be shared across demo users.
      const shared = demoStore.getTripById(tripId);
      if (!shared) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404 });
      }
      const sync = await syncTripToFirestore(shared, { userId });
      return NextResponse.json(sync, { status: sync.ok ? 200 : 502 });
    }
    const sync = await syncTripToFirestore(trip, { userId });
    return NextResponse.json(sync, { status: sync.ok ? 200 : 502 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
