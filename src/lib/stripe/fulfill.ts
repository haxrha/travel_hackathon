import { demoStore, isMemoryGraph } from "../demo/store";
import { retrieveCheckoutSession } from "./client";
import { findLedger, recordLedger } from "./ledger";

export async function fulfillCheckoutSession(sessionId: string) {
  const existing = findLedger(sessionId);
  if (existing?.status === "paid") return existing;

  const session = await retrieveCheckoutSession(sessionId);
  if (session.paymentStatus !== "paid") {
    return recordLedger({
      id: sessionId,
      userId: session.metadata.userId || existing?.userId || "",
      tripId: session.metadata.tripId || existing?.tripId,
      offerId: session.metadata.offerId || existing?.offerId,
      merchant: session.metadata.merchant || existing?.merchant || "Booking",
      amountUsd: session.amountUsd || existing?.amountUsd || 0,
      status: "pending",
      checkoutUrl: existing?.checkoutUrl,
      paymentIntentId: session.paymentIntentId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
  }

  const entry = recordLedger({
    id: sessionId,
    userId: session.metadata.userId || existing?.userId || "",
    tripId: session.metadata.tripId || existing?.tripId,
    offerId: session.metadata.offerId || existing?.offerId,
    merchant: session.metadata.merchant || existing?.merchant || "Booking",
    amountUsd: session.amountUsd || existing?.amountUsd || 0,
    status: "paid",
    paymentIntentId: session.paymentIntentId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });

  if (entry.tripId && isMemoryGraph()) {
    const trip = demoStore.getTripById(entry.tripId);
    const held = trip?.items.find((item) => item.payload?.stripeSessionId === sessionId);
    if (held) {
      held.status = "CONFIRMED";
      held.payload = {
        ...held.payload,
        stripeStatus: "paid",
        confirmationCode: session.paymentIntentId ?? sessionId,
      };
    }
    demoStore.addAlert(entry.tripId, {
      title: `Paid · ${entry.merchant}`,
      body: `Stripe receipt ${session.paymentIntentId ?? sessionId}. Travel Graph updated.`,
      severity: "INFO",
    });
  }

  return entry;
}
