import type { GeocodeResult } from "./types";

/**
 * Place resolution for map stops.
 *
 * The governing rule: never invent a coordinate. An earlier version defaulted
 * every unknown destination to Kyoto and then jittered unplaceable stops around
 * it, which put a San Francisco trip's markers in Japan. A missing pin is
 * recoverable; a confidently wrong one is not. Anything we cannot place
 * resolves to `null` and is reported, not guessed.
 */

/**
 * IATA codes resolved from a table rather than the geocoder.
 *
 * Mapbox does not understand IATA codes as free text — "FRA Airport" returns
 * Lelystad in the Netherlands and "SFO Airport" returns a road in Pune. Airport
 * coordinates are static, so a table is both correct and free.
 */
const AIRPORTS: Record<string, GeocodeResult> = {
  // North America
  SFO: { name: "San Francisco Intl (SFO)", lng: -122.379, lat: 37.6213 },
  JFK: { name: "New York JFK", lng: -73.7781, lat: 40.6413 },
  EWR: { name: "Newark Liberty (EWR)", lng: -74.1745, lat: 40.6895 },
  LGA: { name: "LaGuardia (LGA)", lng: -73.8740, lat: 40.7769 },
  LAX: { name: "Los Angeles Intl (LAX)", lng: -118.4085, lat: 33.9416 },
  ORD: { name: "Chicago O'Hare (ORD)", lng: -87.9073, lat: 41.9742 },
  SEA: { name: "Seattle–Tacoma (SEA)", lng: -122.3088, lat: 47.4502 },
  BOS: { name: "Boston Logan (BOS)", lng: -71.0096, lat: 42.3656 },
  ATL: { name: "Atlanta Hartsfield (ATL)", lng: -84.4277, lat: 33.6407 },
  DFW: { name: "Dallas/Fort Worth (DFW)", lng: -97.038, lat: 32.8998 },
  DEN: { name: "Denver Intl (DEN)", lng: -104.6737, lat: 39.8561 },
  MIA: { name: "Miami Intl (MIA)", lng: -80.2906, lat: 25.7959 },
  IAD: { name: "Washington Dulles (IAD)", lng: -77.456, lat: 38.9531 },
  IAH: { name: "Houston Intercontinental (IAH)", lng: -95.3414, lat: 29.9902 },
  AUS: { name: "Austin–Bergstrom (AUS)", lng: -97.6699, lat: 30.1975 },
  IND: { name: "Indianapolis Intl (IND)", lng: -86.2944, lat: 39.7169 },
  YYZ: { name: "Toronto Pearson (YYZ)", lng: -79.6248, lat: 43.6777 },
  YVR: { name: "Vancouver Intl (YVR)", lng: -123.1815, lat: 49.1967 },
  MEX: { name: "Mexico City (MEX)", lng: -99.0721, lat: 19.4363 },
  GRU: { name: "São Paulo Guarulhos (GRU)", lng: -46.4731, lat: -23.4356 },

  // Europe
  LHR: { name: "London Heathrow (LHR)", lng: -0.4543, lat: 51.47 },
  LGW: { name: "London Gatwick (LGW)", lng: -0.1821, lat: 51.1537 },
  CDG: { name: "Paris Charles de Gaulle (CDG)", lng: 2.5479, lat: 49.0097 },
  ORY: { name: "Paris Orly (ORY)", lng: 2.3594, lat: 48.7262 },
  AMS: { name: "Amsterdam Schiphol (AMS)", lng: 4.7683, lat: 52.3105 },
  FRA: { name: "Frankfurt Main (FRA)", lng: 8.5622, lat: 50.0379 },
  MUC: { name: "Munich Franz Josef Strauss (MUC)", lng: 11.7861, lat: 48.3538 },
  BER: { name: "Berlin Brandenburg (BER)", lng: 13.5033, lat: 52.3666 },
  LIS: { name: "Lisbon Portela (LIS)", lng: -9.1359, lat: 38.7756 },
  OPO: { name: "Porto (OPO)", lng: -8.6814, lat: 41.2481 },
  MAD: { name: "Madrid Barajas (MAD)", lng: -3.5676, lat: 40.4936 },
  BCN: { name: "Barcelona El Prat (BCN)", lng: 2.0785, lat: 41.2974 },
  FCO: { name: "Rome Fiumicino (FCO)", lng: 12.2389, lat: 41.8003 },
  MXP: { name: "Milan Malpensa (MXP)", lng: 8.7281, lat: 45.6306 },
  ZRH: { name: "Zurich (ZRH)", lng: 8.5492, lat: 47.4647 },
  VIE: { name: "Vienna (VIE)", lng: 16.5697, lat: 48.1103 },
  CPH: { name: "Copenhagen (CPH)", lng: 12.6508, lat: 55.6181 },
  ARN: { name: "Stockholm Arlanda (ARN)", lng: 17.9186, lat: 59.6519 },
  DUB: { name: "Dublin (DUB)", lng: -6.27, lat: 53.4213 },

  // Asia-Pacific, Middle East, Africa
  HND: { name: "Tokyo Haneda (HND)", lng: 139.7798, lat: 35.5494 },
  NRT: { name: "Tokyo Narita (NRT)", lng: 140.3929, lat: 35.772 },
  KIX: { name: "Kansai Intl (KIX)", lng: 135.244, lat: 34.434 },
  ICN: { name: "Seoul Incheon (ICN)", lng: 126.4505, lat: 37.4602 },
  SIN: { name: "Singapore Changi (SIN)", lng: 103.9915, lat: 1.3644 },
  BKK: { name: "Bangkok Suvarnabhumi (BKK)", lng: 100.7501, lat: 13.69 },
  HKG: { name: "Hong Kong Intl (HKG)", lng: 113.9185, lat: 22.308 },
  DXB: { name: "Dubai Intl (DXB)", lng: 55.3644, lat: 25.2532 },
  BLR: { name: "Bengaluru Kempegowda (BLR)", lng: 77.7066, lat: 13.1986 },
  BOM: { name: "Mumbai Chhatrapati Shivaji (BOM)", lng: 72.8679, lat: 19.0896 },
  DEL: { name: "Delhi Indira Gandhi (DEL)", lng: 77.1031, lat: 28.5562 },
  SYD: { name: "Sydney Kingsford Smith (SYD)", lng: 151.1772, lat: -33.9399 },
  MEL: { name: "Melbourne (MEL)", lng: 144.8433, lat: -37.669 },
  CPT: { name: "Cape Town (CPT)", lng: 18.6021, lat: -33.9649 },
};

/** Offline city anchors, used when the geocoder is unavailable. */
const PLACES: Record<string, GeocodeResult> = {
  // Kyoto neighbourhood detail — the demo trip relies on these being exact.
  kyoto: { name: "Kyoto", lng: 135.7681, lat: 35.0116 },
  gion: { name: "Gion", lng: 135.7751, lat: 35.0037 },
  yasaka: { name: "Yasaka Shrine", lng: 135.7786, lat: 35.0036 },
  "fushimi inari": { name: "Fushimi Inari", lng: 135.7727, lat: 34.9671 },
  fushimi: { name: "Fushimi Inari", lng: 135.7727, lat: 34.9671 },
  nishiki: { name: "Nishiki Market", lng: 135.7648, lat: 35.005 },
  pontocho: { name: "Pontocho", lng: 135.7715, lat: 35.0045 },
  higashiyama: { name: "Higashiyama", lng: 135.782, lat: 35.002 },
  philosopher: { name: "Philosopher's Path", lng: 135.7955, lat: 35.0265 },
  arashiyama: { name: "Arashiyama", lng: 135.6721, lat: 35.0094 },
  kinkaku: { name: "Kinkaku-ji", lng: 135.7292, lat: 35.0394 },
  kiyomizu: { name: "Kiyomizu-dera", lng: 135.785, lat: 34.9949 },

  // Lisbon
  lisbon: { name: "Lisbon", lng: -9.1393, lat: 38.7223 },
  alcantara: { name: "Alcântara, Lisbon", lng: -9.1774, lat: 38.7036 },
  "lx factory": { name: "LX Factory, Lisbon", lng: -9.1785, lat: 38.7027 },
  "time out market": { name: "Time Out Market, Lisbon", lng: -9.1459, lat: 38.7071 },
  sintra: { name: "Sintra", lng: -9.3907, lat: 38.7979 },
  baixa: { name: "Baixa, Lisbon", lng: -9.139, lat: 38.7139 },
  alfama: { name: "Alfama, Lisbon", lng: -9.131, lat: 38.7129 },

  // San Francisco
  "san francisco": { name: "San Francisco", lng: -122.4194, lat: 37.7749 },
  soma: { name: "SoMa, San Francisco", lng: -122.4014, lat: 37.7785 },
  embarcadero: { name: "Embarcadero, San Francisco", lng: -122.3956, lat: 37.7955 },

  // Other common destinations
  tokyo: { name: "Tokyo", lng: 139.6917, lat: 35.6895 },
  "new york": { name: "New York", lng: -73.9857, lat: 40.7484 },
  london: { name: "London", lng: -0.1276, lat: 51.5072 },
  paris: { name: "Paris", lng: 2.3522, lat: 48.8566 },
  amsterdam: { name: "Amsterdam", lng: 4.9041, lat: 52.3676 },
  berlin: { name: "Berlin", lng: 13.405, lat: 52.52 },
  munich: { name: "Munich", lng: 11.582, lat: 48.1351 },
  barcelona: { name: "Barcelona", lng: 2.1734, lat: 41.3851 },
  madrid: { name: "Madrid", lng: -3.7038, lat: 40.4168 },
  rome: { name: "Rome", lng: 12.4964, lat: 41.9028 },
  singapore: { name: "Singapore", lng: 103.8198, lat: 1.3521 },
  bengaluru: { name: "Bengaluru", lng: 77.5946, lat: 12.9716 },
  seattle: { name: "Seattle", lng: -122.3321, lat: 47.6062 },
  chicago: { name: "Chicago", lng: -87.6298, lat: 41.8781 },
};

function token(): string | undefined {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
}

/** Pulls a standalone IATA code out of text, e.g. "BER → FRA · Jonas". */
export function extractAirportCodes(text: string): string[] {
  return (text.match(/\b[A-Z]{3}\b/g) ?? []).filter((c) => c in AIRPORTS);
}

export function airportCoords(code: string): GeocodeResult | null {
  const hit = AIRPORTS[code.toUpperCase()];
  return hit ? { ...hit } : null;
}

/**
 * Matches an offline anchor. Requires a word-boundary match so short keys can't
 * fire on substrings — "soma" must not match "Somerset".
 */
function matchKnownPlace(q: string): GeocodeResult | null {
  const lower = q.toLowerCase();
  const keys = Object.keys(PLACES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const re = new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    if (re.test(lower)) return { ...PLACES[key]! };
  }
  return null;
}

/**
 * Build a geocoder query for an item.
 *
 * Flights are handled upstream via the IATA table, so this is only for
 * places the geocoder can actually reason about.
 */
export function buildGeocodeQuery(
  item: { kind: string; title: string; location?: string | null },
  destination: string,
): string {
  const dest = destination.trim();
  const destCity = dest.split(",")[0]?.trim() || dest;

  if (item.location && item.location.trim().length > 1) {
    const loc = item.location.trim();
    if (loc.toLowerCase().includes(destCity.toLowerCase())) return loc;
    return `${loc}, ${dest}`;
  }

  let place = item.title
    .replace(/^(compact|local|easy pace|indoor backup|upgrade)\s*[·:—-]\s*/i, "")
    .replace(/^(dinner|lunch|breakfast|brunch)\s*[·:—-]\s*/i, "")
    .replace(/^(check in|check out)\s*/i, "")
    .trim();

  // Generic planner phrasing carries no place information.
  if (/^(morning|afternoon|evening|neighborhood|local|anchor|exploration|experience|day \d)/i.test(place)) {
    place = destCity;
  }
  return `${place}, ${dest}`;
}

interface GeocodeOptions {
  /** Trusted centre used for proximity biasing and sanity-checking. */
  near?: GeocodeResult | null;
  /** Max degrees a result may sit from `near` before it's rejected. */
  maxDegrees?: number;
}

/**
 * Resolves a free-text query. Returns null rather than a fabricated point.
 */
export async function geocode(
  query: string,
  opts: GeocodeOptions = {},
): Promise<GeocodeResult | null> {
  const { near, maxDegrees = 3 } = opts;
  const t = token();

  if (t) {
    try {
      const prox = near ? `&proximity=${near.lng},${near.lat}` : "";
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${t}&limit=1&types=poi,place,locality,neighborhood,address${prox}`;
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (res.ok) {
        const data = await res.json();
        const f = data.features?.[0];
        if (f?.center) {
          const [lng, lat] = f.center as [number, number];
          // Only sanity-check against a centre we actually trust. Rejecting
          // against a guessed centre is what previously dragged results to
          // the wrong continent.
          const farAway =
            near &&
            (Math.abs(lat - near.lat) > maxDegrees || Math.abs(lng - near.lng) > maxDegrees);
          if (!farAway) {
            return { name: f.place_name ?? query, lng, lat, placeType: f.place_type?.[0] };
          }
        }
      }
    } catch {
      /* fall through to offline anchors */
    }
  }

  return matchKnownPlace(query);
}

/**
 * Resolves the trip's destination to a map centre.
 *
 * Memoized per process — every stop in a trip asks for the same centre, and
 * this is the one lookup that must not fail silently.
 */
const centerCache = new Map<string, GeocodeResult | null>();

export async function resolveDestinationCenter(
  destination: string,
): Promise<GeocodeResult | null> {
  const key = destination.trim().toLowerCase();
  if (centerCache.has(key)) return centerCache.get(key)!;

  // A destination naming an airport resolves from the table first.
  const codes = extractAirportCodes(destination);
  let result: GeocodeResult | null = codes.length ? airportCoords(codes[0]) : null;

  // Offline anchor next — cheap and exact for the cities we know.
  result ??= matchKnownPlace(destination);

  // Otherwise ask Mapbox, with no proximity filter: this IS the anchor.
  result ??= await geocode(destination, {});

  centerCache.set(key, result);
  return result;
}

/** Test seam — clears the destination cache. */
export function __resetGeocodeCache() {
  centerCache.clear();
}

export interface ResolvedCoords {
  lat: number;
  lng: number;
  geocodedName: string;
  /** How the point was determined, for debugging bad pins. */
  source: "payload" | "airport" | "geocoder" | "anchor";
}

/**
 * Resolve coordinates for a trip item, or null when it genuinely cannot be
 * placed. Callers must handle null by omitting the marker — not by falling
 * back to the destination, which produces a pile of pins on one spot.
 */
export async function resolveItemCoords(
  item: {
    kind: string;
    title: string;
    location?: string | null;
    payload?: Record<string, unknown> | null;
  },
  destination: string,
  center?: GeocodeResult | null,
): Promise<ResolvedCoords | null> {
  const payload = (item.payload ?? {}) as Record<string, unknown>;

  // 1. Coordinates already on the item always win.
  if (typeof payload.lat === "number" && typeof payload.lng === "number") {
    return {
      lat: payload.lat,
      lng: payload.lng,
      geocodedName:
        typeof payload.geocodedName === "string"
          ? payload.geocodedName
          : item.location || item.title,
      source: "payload",
    };
  }

  const anchor = center !== undefined ? center : await resolveDestinationCenter(destination);

  // 2. Flights resolve from the IATA table — the geocoder cannot read codes.
  //    Use the arrival airport: that's where the traveler ends up.
  if (item.kind === "FLIGHT" || item.kind === "TRANSFER" || item.kind === "TRANSIT") {
    const fromPayload = [payload.destinationAirport, payload.arrivalAirport]
      .filter((v): v is string => typeof v === "string")
      .map(airportCoords)
      .find(Boolean);
    if (fromPayload) return { ...fromPayload, geocodedName: fromPayload.name, source: "airport" };

    const codes = extractAirportCodes(`${item.title} ${item.location ?? ""}`);
    if (codes.length) {
      const hit = airportCoords(codes[codes.length - 1]);
      if (hit) return { ...hit, geocodedName: hit.name, source: "airport" };
    }
  }

  // 3. Everything else goes through the geocoder, biased to the destination.
  const query = buildGeocodeQuery(item, destination);
  const g = await geocode(query, { near: anchor });
  if (g) {
    return {
      lat: g.lat,
      lng: g.lng,
      geocodedName: g.name,
      source: matchKnownPlace(query) && !token() ? "anchor" : "geocoder",
    };
  }

  // 4. Unplaceable. Say so rather than inventing a location.
  return null;
}
