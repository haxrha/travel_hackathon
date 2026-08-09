import type { TripStop } from "./types";

/**
 * Mapbox Optimization API (TSP) — falls back to time-order when no token.
 */
export async function optimizeStopOrder(stops: TripStop[]): Promise<TripStop[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token || stops.length < 3) {
    return [...stops].sort((a, b) => a.order - b.order);
  }
  try {
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(";");
    const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${coords}?access_token=${token}&roundtrip=false&source=first&destination=last`;
    const res = await fetch(url);
    if (!res.ok) return stops;
    const data = await res.json();
    const waypoints = data.waypoints as { waypoint_index: number }[] | undefined;
    if (!waypoints) return stops;
    const ordered = [...stops];
    waypoints.forEach((wp, i) => {
      ordered[wp.waypoint_index] = { ...stops[i], order: wp.waypoint_index };
    });
    return ordered.sort((a, b) => a.order - b.order);
  } catch {
    return stops;
  }
}
