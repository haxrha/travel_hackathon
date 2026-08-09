import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { buildDayRoute, itemsToStops } from "@/lib/mapbox/directions";
import type { TransportMode } from "@/lib/mapbox/types";

export async function POST(req: Request) {
  try {
    await requireUserId();
    const { tripId, dayOffset = 0, mode = "walking" } = await req.json();
    if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

    const userId = await requireUserId();
    const trip = await new TravelGraph(userId).getTrip({ tripId });
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

    const stops = await itemsToStops(
      trip.items as any[],
      trip.destination,
      (trip as any).startDate ?? null,
    );
    const dayStops = stops.filter((s) => s.dayOffset === dayOffset);
    const route = await buildDayRoute(tripId, dayOffset, dayStops, mode as TransportMode);

    return NextResponse.json({
      ok: true,
      stops: dayStops,
      allStops: stops,
      route,
      mapboxToken:
        [process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN, process.env.MAPBOX_ACCESS_TOKEN].find((t) =>
          t?.startsWith("pk."),
        ) || null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const dayOffset = Number(searchParams.get("dayOffset") ?? 0);
  const mode = (searchParams.get("mode") ?? "walking") as TransportMode;
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const userId = await requireUserId();
  const trip = await new TravelGraph(userId).getTrip({ tripId });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const stops = await itemsToStops(trip.items as any[], trip.destination, (trip as any).startDate ?? null);
  const dayStops = stops.filter((s) => s.dayOffset === dayOffset);
  const route = await buildDayRoute(tripId, dayOffset, dayStops, mode);

  const pub = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";
  const srv = process.env.MAPBOX_ACCESS_TOKEN || "";
  // Mapbox GL JS only accepts public tokens (pk.*) — never send sk.* to the browser
  const mapboxToken = [pub, srv].find((t) => t.startsWith("pk.")) || null;

  return NextResponse.json({
    ok: true,
    trip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      startDate: (trip as any).startDate,
      endDate: (trip as any).endDate,
    },
    days: [...new Set(stops.map((s) => s.dayOffset))].sort((a, b) => a - b),
    stops: dayStops,
    allStops: stops,
    route,
    mapboxToken,
  });
}
