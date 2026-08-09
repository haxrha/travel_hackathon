/** Mapbox types for Travel Graph ↔ Routing */

export type TransportMode = "driving" | "walking" | "cycling" | "transit";

/**
 * Leg mode. Extends TransportMode with "flight" for hops no ground profile can
 * cover — routing JFK→Kansai as a walk produced a 2,889-hour itinerary.
 */
export type LegMode = TransportMode | "flight";

export interface TripStop {
  id: string;
  tripItemId: string;
  title: string;
  kind: string;
  lng: number;
  lat: number;
  dayOffset: number;
  order: number;
  priceUsd?: number;
  description?: string;
  whatToDo?: string[];
  startTime?: string | null;
  status?: string;
  location?: string | null;
}

export interface RouteLeg {
  fromStopId: string;
  toStopId: string;
  distanceMeters: number;
  durationSeconds: number;
  mode: LegMode;
  geometry: GeoJSON.LineString;
  summary?: string;
}

export interface Route {
  id: string;
  tripId: string;
  dayOffset: number;
  mode: TransportMode;
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[];
  geometry: GeoJSON.LineString;
  status: "active" | "completed" | "disrupted" | "replanning";
}

export interface GeocodeResult {
  name: string;
  lng: number;
  lat: number;
  placeType?: string;
}

export function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatDistance(meters: number) {
  const mi = meters / 1609.34;
  if (mi < 0.1) return `${Math.round(meters)} m`;
  return `${mi.toFixed(1)} mi`;
}
