import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { fulfillCheckoutSession } from "@/lib/stripe/fulfill";
import { isStripeConfigured } from "@/lib/stripe/env";

/** Called when Checkout redirects back with session_id. */
export async function POST(req: Request) {
  try {
    await requireUserId();
    if (!isStripeConfigured()) {
      return NextResponse.json({ ok: false, error: "Stripe is not configured" }, { status: 400 });
    }
    const body = await req.json();
    const sessionId = String(body.sessionId ?? "");
    if (!sessionId.startsWith("cs_")) {
      return NextResponse.json({ ok: false, error: "Expected a Checkout session id" }, { status: 400 });
    }
    const entry = await fulfillCheckoutSession(sessionId);
    return NextResponse.json({ ok: true, payment: entry });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
