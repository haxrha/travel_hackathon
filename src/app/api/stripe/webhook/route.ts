import { NextResponse } from "next/server";
import { getStripeEnv } from "@/lib/stripe/env";
import { verifyStripeSignature } from "@/lib/stripe/signature";
import { fulfillCheckoutSession } from "@/lib/stripe/fulfill";
import { recordLedger } from "@/lib/stripe/ledger";

export const runtime = "nodejs";

/**
 * Stripe webhook. Configure the endpoint to
 * `{APP_URL}/api/stripe/webhook` and set STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = getStripeEnv().webhookSecret;
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not set" }, { status: 500 });
  }
  if (!verifyStripeSignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const object = event.data?.object ?? {};

  if (event.type === "checkout.session.completed" && typeof object.id === "string") {
    await fulfillCheckoutSession(object.id);
  }

  if (event.type === "payment_intent.succeeded" && typeof object.id === "string") {
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const amount = typeof object.amount === "number" ? object.amount / 100 : 0;
    recordLedger({
      id: object.id,
      userId: typeof metadata.userId === "string" ? metadata.userId : "",
      tripId: typeof metadata.tripId === "string" ? metadata.tripId : undefined,
      offerId: typeof metadata.offerId === "string" ? metadata.offerId : undefined,
      merchant: typeof metadata.merchant === "string" ? metadata.merchant : "Stripe",
      amountUsd: amount,
      status: "paid",
      paymentIntentId: object.id,
      createdAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ received: true });
}
