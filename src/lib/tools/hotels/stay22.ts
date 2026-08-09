/* eslint-disable @typescript-eslint/no-explicit-any --
 * This module's job is to narrow untyped third-party JSON into Stay22Hotel.
 * The `any` uses are confined to the raw response objects inside the normalizer;
 * everything crossing the module boundary is fully typed.
 */

/**
 * Stay22 hotel tool — live availability/pricing + affiliate booking links.
 * Falls back to deterministic mock when the live call fails or key is absent.
 */

export interface Stay22Hotel {
  id: string;
  name: string;
  neighborhood?: string;
  /** Full street address from the provider — shown on the trip page. */
  address?: string;
  lat?: number;
  lng?: number;
  starRating?: number;
  /** Guest review score out of 10, distinct from star rating. */
  reviewScore?: number;
  reviewCount?: number;
  pricePerNight: number;
  /** Stay period total. The provider quotes totals, not nightly rates. */
  totalPrice?: number;
  nights?: number;
  currency: string;
  bookingUrl: string;
  thumbnail?: string;
  freeCancellation?: boolean;
  instantBook?: boolean;
  roomType?: string;
  suppliers: { name: string; price: number; url: string }[];
  amenities?: string[];
  noiseScore?: number;
  walkability?: number;
  safetyScore?: number;
  live?: boolean;
}

export interface HotelSearchParams {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  maxPriceUsd?: number;
  neighborhood?: string;
}

export async function searchHotels(params: HotelSearchParams): Promise<Stay22Hotel[]> {
  const key = process.env.STAY22_API_KEY;
  try {
    const qs = new URLSearchParams({
      address: params.destination,
      checkin: params.checkIn,
      checkout: params.checkOut,
      adults: String(params.guests ?? 2),
      currency: "USD",
      pageSize: "12",
    });
    if (params.maxPriceUsd) qs.set("max", String(params.maxPriceUsd));
    if (process.env.STAY22_AID) qs.set("aid", process.env.STAY22_AID);

    const headers: HeadersInit = { Accept: "application/json" };
    if (key) headers["X-API-KEY"] = key;

    const res = await fetch(`https://api.stay22.com/v2/accommodations?${qs}`, {
      headers,
      next: { revalidate: 0 },
    });
    if (!res.ok) return mockHotels(params);
    const data = await res.json();
    const results = (data.results ?? data.data ?? []) as any[];
    if (!results.length) return mockHotels(params);

    // The provider reports the stay length it actually priced; trust that over
    // our own date math so per-night figures line up with the quoted total.
    const nights = Number(data.meta?.nights) || nightsBetween(params.checkIn, params.checkOut);
    const currency = String(data.meta?.currency ?? "USD");

    return results
      .slice(0, 12)
      .map((r, i) => normalizeStay22(r, params, i, nights, currency));
  } catch {
    return mockHotels(params);
  }
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(checkIn);
  const b = Date.parse(checkOut);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

/** Pulls a numeric amount out of the several shapes Stay22 uses for money. */
function supplierTotal(v: any): number | null {
  const raw = v?.price?.total ?? v?.price?.amount ?? v?.price ?? v?.total;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Map one Stay22 result onto Stay22Hotel.
 *
 * Field paths matter here: prices arrive as `suppliers.<name>.price.total` for
 * the WHOLE stay, coordinates live under `location.coordinates`, and `rating` is
 * an object rather than a number. Reading any of those as a plain scalar yields
 * NaN, which previously fell through to a synthetic price and made live
 * inventory look invented.
 */
function normalizeStay22(
  r: any,
  p: HotelSearchParams,
  i: number,
  nights: number,
  currency: string,
): Stay22Hotel {
  const suppliers = Object.entries(r.suppliers ?? {})
    .map(([name, v]: [string, any]) => {
      const total = supplierTotal(v);
      return total == null
        ? null
        : { name, price: total, url: String(v?.link ?? r.url ?? "#") };
    })
    .filter((s): s is { name: string; price: number; url: string } => s !== null);

  const cheapestTotal = suppliers.length
    ? Math.min(...suppliers.map((s) => s.price))
    : null;

  const coords = r.location?.coordinates ?? {};
  const rating = r.rating ?? {};

  return {
    id: String(r.id ?? `${p.destination}-${i}`),
    name: String(r.name ?? r.title ?? `Stay ${i + 1}`),
    neighborhood: r.neighborhood ?? r.area ?? p.neighborhood ?? p.destination,
    address: r.location?.address ? String(r.location.address) : undefined,
    lat: numOrUndefined(coords.lat ?? r.lat ?? r.latitude),
    lng: numOrUndefined(coords.lng ?? r.lng ?? r.longitude),
    starRating: numOrUndefined(rating.hotelStars ?? r.stars ?? r.starRating),
    reviewScore: numOrUndefined(rating.value),
    reviewCount: numOrUndefined(rating.count),
    pricePerNight: cheapestTotal != null ? Math.round(cheapestTotal / nights) : 0,
    totalPrice: cheapestTotal ?? undefined,
    nights,
    currency: String(r.currency ?? currency),
    bookingUrl: String(r.url ?? suppliers[0]?.url ?? "https://www.stay22.com"),
    thumbnail: r.media?.thumbnail ? String(r.media.thumbnail) : undefined,
    freeCancellation: r.policies?.freeCancellation ?? undefined,
    instantBook: r.policies?.instantBook ?? undefined,
    roomType: r.capacity
      ? `${r.capacity.bedrooms ?? 1} bed · sleeps ${r.capacity.guests ?? 2}`
      : undefined,
    // Per-night supplier prices so comparisons are like-for-like with the headline.
    suppliers: suppliers.map((s) => ({ ...s, price: Math.round(s.price / nights) })),
    amenities: Array.isArray(r.amenities) ? r.amenities : undefined,
    walkability: numOrUndefined(r.walkability),
    live: true,
  };
}

function numOrUndefined(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function wayportMatchScore(
  hotel: Stay22Hotel,
  prefs: Partial<{ food: number; nightlife: number; walking: number; budgetSensitivity: number }>,
): number {
  let score = 70;
  if (prefs.walking && hotel.walkability) score += (hotel.walkability - 70) * 0.4;
  if (prefs.budgetSensitivity) score += Math.max(0, 100 - hotel.pricePerNight * 0.3) * prefs.budgetSensitivity;
  if (prefs.nightlife && hotel.neighborhood) score += 6;
  if (hotel.live) score += 4;
  return Math.max(0, Math.min(99, Math.round(score)));
}

function mockHotels(p: HotelSearchParams): Stay22Hotel[] {
  const mk = (name: string, price: number, star: number, walk: number): Stay22Hotel => ({
    id: `${p.destination}-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    neighborhood: p.neighborhood ?? "Central",
    starRating: star,
    pricePerNight: price,
    currency: "USD",
    bookingUrl: `https://stay22.com/allez?aid=${process.env.STAY22_AID ?? "wayport"}`,
    suppliers: [
      { name: "Booking.com", price: price + 15, url: "#" },
      { name: "Hotels.com", price: price + 12, url: "#" },
      { name: "Expedia", price: price + 18, url: "#" },
      { name: "VRBO", price: price + 8, url: "#" },
    ],
    amenities: ["wifi", "breakfast"],
    noiseScore: 0.22,
    walkability: walk,
    safetyScore: 0.94,
    live: false,
  });
  return [
    mk("The Meridian", 242, 4.2, 92),
    mk("Solstice House", 198, 4.1, 88),
    mk("Ember Lofts", 267, 4.6, 85),
  ];
}
