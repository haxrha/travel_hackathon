import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { ExecutionAgent } from "@/lib/agents/execution";
import { getBookingProvider, type NormalizedOffer } from "@/lib/tools/providers/booking";
import { defaultAutonomy } from "@/lib/agents/orchestrator";
import { getOrCreateProfile } from "@/lib/demo/store";
import { isStripeConfigured, isStripeTestMode, listStripeCharges } from "@/lib/stripe/client";
import { listLedger } from "@/lib/stripe/ledger";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { action, tripId, kind, params, offer, approved } = body;
    const profile = getOrCreateProfile(userId);
    const autonomy = { ...defaultAutonomy(), ...profile.autonomy } as any;
    const agent = new ExecutionAgent({ userId, tripId, autonomy });
    const stripe = {
      configured: isStripeConfigured(),
      testMode: isStripeTestMode(),
    };

    if (action === "search") {
      const offers = await agent.searchAndRank(kind ?? "hotel", params ?? {});
      return NextResponse.json({ ok: true, offers });
    }

    if (action === "propose") {
      const decision = await agent.proposeBook(offer as NormalizedOffer);
      return NextResponse.json({ ok: true, decision, offer, stripe });
    }

    if (action === "book") {
      const result = await agent.confirmBook(offer as NormalizedOffer, !!approved);
      return NextResponse.json({ ok: true, stripe, ...result });
    }

    if (action === "history") {
      if (!stripe.configured) {
        return NextResponse.json({
          ok: true,
          stripe,
          purchases: listLedger(userId),
          message: "Stripe not configured — set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for Checkout)",
        });
      }
      try {
        const purchases = await listStripeCharges(Number(body.limit ?? 20));
        return NextResponse.json({ ok: true, stripe, purchases });
      } catch (error) {
        return NextResponse.json({
          ok: true,
          stripe,
          purchases: listLedger(userId),
          message: error instanceof Error ? error.message : "Could not list Stripe charges",
        });
      }
    }

    if (action === "cancel") {
      const r = await getBookingProvider().cancel(body.confirmationCode);
      return NextResponse.json({ ...r, ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
