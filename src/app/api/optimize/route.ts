import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { itemsToStops } from "@/lib/mapbox/directions";
import { optimizeStopOrder } from "@/lib/mapbox/optimization";
import { TravelGraph } from "@/lib/graph/service";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { tripId, dayOffset = 0 } = await req.json();
    const trip = await new TravelGraph(userId).getTrip({ tripId });
    if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });
    const stops = await itemsToStops(trip.items as any[], trip.destination, (trip as any).startDate);
    const dayStops = stops.filter((s) => s.dayOffset === dayOffset);
    const optimized = await optimizeStopOrder(dayStops);
    return NextResponse.json({ ok: true, stops: optimized });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
