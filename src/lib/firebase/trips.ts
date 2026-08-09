/**
 * Persist structured trip proposals to Firestore.
 * Collection: `trips/{tripId}` — document body matches TripProposal wire shape
 * plus WAYPORT metadata (trip_id, user_id, synced_at).
 */

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import type { DemoTrip } from "@/lib/demo/store";
import { getServerFirestore, isFirebaseConfigured } from "./server";
import { buildTripProposalDocument } from "./trip-document";
import type { TripProposal } from "@/lib/enterprise/proposal";

/** Firestore rejects `undefined` — strip recursively before write. */
function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out as T;
}

export type SyncTripResult =
  | { ok: true; path: string; proposal: TripProposal }
  | { ok: false; skipped?: boolean; error: string };

/**
 * Build the proposal-shaped document and upsert `trips/{tripId}` in Firestore.
 * Runs Gemini (or synthetic) research quotes first so flights/hotel/ground
 * are priced instead of "Not quoted".
 */
export async function syncTripToFirestore(
  trip: DemoTrip,
  opts?: { userId?: string; skipQuotes?: boolean },
): Promise<SyncTripResult> {
  if (!isFirebaseConfigured()) {
    return { ok: false, skipped: true, error: "Firebase not configured" };
  }

  try {
    if (!opts?.skipQuotes) {
      const needsQuotes =
        !trip.meta?.researchQuotes ||
        !trip.coordination?.travelers?.some((t) => t.inbound?.priceUsd);
      if (needsQuotes) {
        const { enrichTripWithLiveQuotes } = await import("@/lib/agents/quote-research");
        await enrichTripWithLiveQuotes(trip);
      }
    }

    // Always rebuild after quotes so we don't freeze a stale unpriced proposal.
    if (trip.coordination?.proposal && trip.meta?.researchQuotes) {
      trip.coordination.proposal = undefined;
    }

    const proposal = buildTripProposalDocument(trip);
    const db = getServerFirestore();
    const ref = doc(db, "trips", trip.id);
    const payload = stripUndefined({
      ...proposal,
      trip_id: trip.id,
      user_id: opts?.userId ?? trip.userId,
      wayport_title: trip.title,
      wayport_status: trip.status,
      origin: trip.origin,
      origin_airport: trip.originAirport,
      arrival_airport: trip.arrivalAirport,
      cost_center: trip.coordination?.costCenter ?? null,
      synced_at: serverTimestamp(),
    });

    await setDoc(ref, payload, { merge: true });

    // Keep a copy on the in-memory trip so the Proposal tab can render it.
    if (trip.coordination) {
      trip.coordination.proposal = proposal;
    } else if (proposal.flights.length || proposal.hotel) {
      // Solo trips: stash under meta for consumers that look there.
      trip.meta = { ...(trip.meta ?? {}), proposal };
    }

    return { ok: true, path: `trips/${trip.id}`, proposal };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Firestore sync failed";
    console.error("[firebase] syncTripToFirestore", msg);
    return { ok: false, error: msg };
  }
}
