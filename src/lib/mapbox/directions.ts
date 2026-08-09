import type { Route, RouteLeg, TransportMode, TripStop } from "./types";
import { randomUUID } from "crypto";

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function curve(a: [number, number], b: [number, number]): [number, number][] {
  const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.08;
  const my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.08;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const u = 1 - t;
    pts.push([
      u * u * a[0] + 2 * u * t * mx + t * t * b[0],
      u * u * a[1] + 2 * u * t * my + t * t * b[1],
    ]);
  }
  return pts;
}

async function mapboxDirections(
  coords: [number, number][],
  mode: TransportMode,
): Promise<{ geometry: GeoJSON.LineString; distance: number; duration: number; legs: { distance: number; duration: number }[] } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token || coords.length < 2) return null;
  const profile = mode === "walking" ? "walking" : mode === "cycling" ? "cycling" : "driving-traffic";
  const path = coords.map((c) => `${c[0]},${c[1]}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${path}?geometries=geojson&overview=full&steps=false&access_token=${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;
    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      legs: (route.legs ?? []).map((l: any) => ({ distance: l.distance, duration: l.duration })),
    };
  } catch {
    return null;
  }
}

/** Beyond this, no ground profile is plausible — treat the hop as a flight. */
const GROUND_LIMIT_METERS = 300_000;
/** Cruise speed incl. taxi/climb, used only to label flight legs. */
const FLIGHT_SPEED_MPS = 220;
/**
 * Past this, nobody is walking regardless of the selected mode — an airport
 * transfer is a train or a car. Legs above it are timed and labelled as driving
 * so a 40 km hop doesn't read as a three-hour stroll.
 */
const WALKABLE_LIMIT_METERS = 8_000;

const GROUND_SPEED: Record<TransportMode, number> = {
  walking: 1.35,
  cycling: 4.5,
  driving: 8.5,
  transit: 7.0,
};

/**
 * Builds a day's route.
 *
 * Consecutive stops are only routed on the ground when they're actually within
 * ground range. A day containing a long-haul flight (JFK in the morning, Kyoto
 * that evening) previously asked Mapbox for a walking route across the Pacific,
 * fell back to great-circle distance at walking speed, and reported a 2,889-hour
 * day. Long hops are now their own leg type: drawn as an arc, timed at cruise
 * speed, and excluded from the ground totals.
 */
export async function buildDayRoute(
  tripId: string,
  dayOffset: number,
  stops: TripStop[],
  mode: TransportMode = "walking",
): Promise<Route | null> {
  if (stops.length < 2) return null;
  const ordered = [...stops].sort((a, b) => a.order - b.order);

  const pt = (s: TripStop): [number, number] => [s.lng, s.lat];

  // Split into runs of stops that are plausibly connected by ground transport.
  const runs: TripStop[][] = [[ordered[0]]];
  for (let i = 1; i < ordered.length; i++) {
    const gap = haversine(pt(ordered[i - 1]), pt(ordered[i]));
    if (gap > GROUND_LIMIT_METERS) runs.push([ordered[i]]);
    else runs[runs.length - 1].push(ordered[i]);
  }

  const legs: RouteLeg[] = [];
  const geometryCoords: [number, number][] = [];
  let groundDist = 0;
  let groundDur = 0;

  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];

    // Ground legs within this run, routed together for an accurate path.
    if (run.length > 1) {
      const live = await mapboxDirections(run.map(pt), mode);
      for (let i = 0; i < run.length - 1; i++) {
        const a = pt(run[i]);
        const b = pt(run[i + 1]);
        const dist = live?.legs[i]?.distance ?? haversine(a, b) * 1.25;

        // Downgrade unwalkable legs to driving, whatever mode was requested.
        const humanMode: TransportMode =
          (mode === "walking" || mode === "cycling") && dist > WALKABLE_LIMIT_METERS
            ? "driving"
            : mode;
        const dur =
          humanMode === mode && live?.legs[i]?.duration
            ? live.legs[i].duration
            : dist / GROUND_SPEED[humanMode];

        legs.push({
          fromStopId: run[i].id,
          toStopId: run[i + 1].id,
          distanceMeters: dist,
          durationSeconds: dur,
          mode: humanMode,
          geometry: { type: "LineString", coordinates: [a, b] },
          summary:
            humanMode === mode
              ? `${Math.round(dur / 60)} min`
              : `${Math.round(dur / 60)} min by car`,
        });
        groundDist += dist;
        groundDur += dur;
      }
      geometryCoords.push(
        ...((live?.geometry.coordinates as [number, number][] | undefined) ??
          run.flatMap((s, i) => (i === 0 ? [pt(s)] : curve(pt(run[i - 1]), pt(s))))),
      );
    } else {
      geometryCoords.push(pt(run[0]));
    }

    // The hop into the next run is a flight, not a walk.
    const next = runs[r + 1];
    if (next) {
      const from = run[run.length - 1];
      const to = next[0];
      const a = pt(from);
      const b = pt(to);
      const dist = haversine(a, b);
      legs.push({
        fromStopId: from.id,
        toStopId: to.id,
        distanceMeters: dist,
        durationSeconds: dist / FLIGHT_SPEED_MPS,
        mode: "flight",
        geometry: { type: "LineString", coordinates: curve(a, b) },
        summary: `${Math.round(dist / 1000).toLocaleString()} km flight`,
      });
      geometryCoords.push(...curve(a, b));
    }
  }

  return {
    id: randomUUID(),
    tripId,
    dayOffset,
    mode,
    // Totals describe the ground day. Flight legs are listed but not summed in,
    // so "3h 11m · 26 mi" stays a statement about getting around the city.
    distanceMeters: groundDist,
    durationSeconds: groundDur,
    legs,
    geometry: { type: "LineString", coordinates: geometryCoords },
    status: "active",
  };
}

/** Convert trip items → TripStops with coordinates (server-side). */
export async function itemsToStops(
  items: {
    id: string;
    kind: string;
    title: string;
    location?: string | null;
    startTime?: Date | string | null;
    payload?: Record<string, unknown> | null;
    status?: string;
  }[],
  destination: string,
  tripStart?: Date | null,
): Promise<TripStop[]> {
  const { resolveItemCoords, resolveDestinationCenter } = await import("./geocoding");

  // Resolve the destination once; every item is biased against this anchor.
  const center = await resolveDestinationCenter(destination);

  const stops: TripStop[] = [];
  let order = 0;
  for (const it of items) {
    const start = it.startTime ? new Date(it.startTime) : null;
    const payload = (it.payload ?? {}) as Record<string, unknown>;
    const coords = await resolveItemCoords(it, destination, center);
    // A stop we cannot place is omitted. Pinning it to the destination would
    // stack unrelated markers on one point and misrepresent the itinerary.
    if (!coords) continue;
    const meta =
      typeof payload.priceUsd === "number"
        ? null
        : (await import("@/lib/agents/pricing")).enrichItemMeta(it.kind, it.title, it.location ?? undefined);
    stops.push({
      id: `stop-${it.id}`,
      tripItemId: it.id,
      title: it.title,
      kind: it.kind,
      lng: coords.lng,
      lat: coords.lat,
      dayOffset: 0,
      order: order++,
      priceUsd: typeof payload.priceUsd === "number" ? (payload.priceUsd as number) : meta?.priceUsd,
      description: typeof payload.description === "string" ? (payload.description as string) : meta?.description,
      whatToDo: Array.isArray(payload.whatToDo) ? (payload.whatToDo as string[]) : meta?.whatToDo,
      startTime: start?.toISOString() ?? null,
      status: it.status,
      location: it.location || coords.geocodedName,
    });
  }
  // Day buckets from start dates
  const sortedDays = [...new Set(stops.map((s) => (s.startTime ? s.startTime.slice(0, 10) : "unknown")))].sort();
  for (const s of stops) {
    const key = s.startTime ? s.startTime.slice(0, 10) : "unknown";
    s.dayOffset = Math.max(0, sortedDays.indexOf(key));
  }
  // Stable order within day by time then original order
  stops.sort((a, b) => {
    if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
    return (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.order - b.order;
  });
  stops.forEach((s, i) => {
    s.order = i;
  });
  return stops;
}
