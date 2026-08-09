/**
 * Unified BookingProvider — search can be real; book/cancel/modify are mock for hackathon.
 * Intelligence is real. The transaction is simulated.
 */

import { searchHotels, type Stay22Hotel } from "../hotels/stay22";
import { getFlightProvider } from "../flights/normalize";
import { tavilySearch } from "../search/tavily";
import { randomUUID } from "crypto";
import { effectiveCostBreakdown } from "@/lib/graph/world";

export type OfferKind = "hotel" | "flight" | "experience" | "restaurant" | "transport";

export interface NormalizedOffer {
  id: string;
  kind: OfferKind;
  title: string;
  subtitle?: string;
  priceUsd: number;
  currency: string;
  location?: string;
  lat?: number;
  lng?: number;
  score?: number;
  effective?: ReturnType<typeof effectiveCostBreakdown>;
  raw?: unknown;
  provider: string;
  refundable?: boolean;
  policy?: string;
}

export interface BookingResult {
  ok: boolean;
  confirmationCode: string;
  status: "CONFIRMED" | "PENDING" | "FAILED" | "CANCELLED";
  offer: NormalizedOffer;
  steps: string[];
  bookedAt: string;
  /** False when charged through Rain sandbox scoped card. */
  simulated: boolean;
  rain?: {
    receipt: string;
    cardLast4: string;
    merchant: string;
    amountUsd: number;
  };
}

export interface BookingProvider {
  search(kind: OfferKind, params: Record<string, unknown>): Promise<NormalizedOffer[]>;
  getPrice(offerId: string): Promise<number | null>;
  checkAvailability(offerId: string): Promise<boolean>;
  book(offer: NormalizedOffer, meta?: Record<string, unknown>): Promise<BookingResult>;
  cancel(confirmationCode: string): Promise<{ ok: boolean; confirmationCode: string }>;
  modify(confirmationCode: string, patch: Record<string, unknown>): Promise<{ ok: boolean }>;
}

const offerCache = new Map<string, NormalizedOffer>();
const bookings = new Map<string, BookingResult>();

export class WayportBookingProvider implements BookingProvider {
  async search(kind: OfferKind, params: Record<string, unknown>): Promise<NormalizedOffer[]> {
    if (kind === "hotel") {
      const hotels = await searchHotels({
        destination: String(params.destination ?? "city"),
        checkIn: String(params.checkIn ?? new Date().toISOString().slice(0, 10)),
        checkOut: String(params.checkOut ?? new Date().toISOString().slice(0, 10)),
        guests: Number(params.guests ?? 2),
      });
      return hotels.map((h) => normalizeHotel(h));
    }
    if (kind === "flight") {
      const provider = getFlightProvider();
      const offers = await provider.search({
        origin: String(params.origin ?? "JFK"),
        destination: String(params.destination ?? "NRT"),
        departureDate: String(params.departureDate ?? new Date().toISOString().slice(0, 10)),
      });
      return offers.map((o: any, i: number) => {
        const offer: NormalizedOffer = {
          id: o.id ?? `flt-${i}`,
          kind: "flight",
          title: `${o.origin ?? params.origin} → ${o.destination ?? params.destination}`,
          subtitle: o.airline ?? provider.name,
          priceUsd: Number(o.priceUsd ?? o.total ?? 420 + i * 40),
          currency: "USD",
          provider: provider.name,
          refundable: false,
          policy: "Mock fare rules",
          raw: o,
        };
        offer.effective = effectiveCostBreakdown(offer.priceUsd, 0);
        offerCache.set(offer.id, offer);
        return offer;
      });
    }
    if (kind === "experience" || kind === "restaurant") {
      const q = String(params.query ?? `${kind} ${params.destination ?? ""}`);
      const results = await tavilySearch(q, 5);
      return results.map((r, i) => {
        const price = kind === "restaurant" ? 45 + i * 18 : 35 + i * 25;
        const offer: NormalizedOffer = {
          id: `${kind}-${i}-${Buffer.from(r.title).toString("base64").slice(0, 8)}`,
          kind,
          title: r.title,
          subtitle: r.content.slice(0, 100),
          priceUsd: price,
          currency: "USD",
          location: String(params.destination ?? ""),
          provider: "tavily+mock",
          refundable: true,
          score: r.score,
          raw: r,
        };
        offer.effective = effectiveCostBreakdown(offer.priceUsd, 8);
        offerCache.set(offer.id, offer);
        return offer;
      });
    }
    return [];
  }

  async getPrice(offerId: string) {
    return offerCache.get(offerId)?.priceUsd ?? null;
  }

  async checkAvailability(offerId: string) {
    return offerCache.has(offerId) || offerId.startsWith("hotel") || offerId.startsWith("flt");
  }

  async book(offer: NormalizedOffer, _meta?: Record<string, unknown>): Promise<BookingResult> {
    const steps = [
      "Verifying availability",
      "Confirming rate",
      "Creating reservation",
      "Saving confirmation",
      "Updating Travel Graph",
    ];
    // Simulated latency stages — caller can animate
    const confirmationCode = `WP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const result: BookingResult = {
      ok: true,
      confirmationCode,
      status: "CONFIRMED",
      offer,
      steps,
      bookedAt: new Date().toISOString(),
      simulated: true,
    };
    bookings.set(confirmationCode, result);
    offerCache.set(offer.id, offer);
    return result;
  }

  async cancel(confirmationCode: string) {
    const b = bookings.get(confirmationCode);
    if (b) b.status = "CANCELLED";
    return { ok: true, confirmationCode };
  }

  async modify(confirmationCode: string, _patch: Record<string, unknown>) {
    return { ok: bookings.has(confirmationCode) };
  }
}

function normalizeHotel(h: Stay22Hotel): NormalizedOffer {
  const offer: NormalizedOffer = {
    id: h.id,
    kind: "hotel",
    title: h.name,
    subtitle: h.neighborhood,
    priceUsd: h.pricePerNight,
    currency: h.currency,
    location: h.neighborhood,
    lat: h.lat,
    lng: h.lng,
    provider: "stay22",
    refundable: true,
    policy: "Free cancellation (simulated)",
    score: h.walkability,
    raw: h,
  };
  offer.effective = effectiveCostBreakdown(h.pricePerNight * 4, 20);
  offerCache.set(offer.id, offer);
  return offer;
}

let singleton: WayportBookingProvider | null = null;
export function getBookingProvider() {
  if (!singleton) singleton = new WayportBookingProvider();
  return singleton;
}

export function listMockBookings() {
  return [...bookings.values()];
}
