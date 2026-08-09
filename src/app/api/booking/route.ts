import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { ExecutionAgent } from "@/lib/agents/execution";
import { getBookingProvider, type NormalizedOffer } from "@/lib/tools/providers/booking";
import { defaultAutonomy } from "@/lib/agents/orchestrator";
import { getOrCreateProfile } from "@/lib/demo/store";
import { isRainConfigured, purchaseHistory } from "@/lib/rain";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { action, tripId, kind, params, offer, approved } = body;
    const profile = getOrCreateProfile(userId);
    const autonomy = { ...defaultAutonomy(), ...profile.autonomy } as any;
    const agent = new ExecutionAgent({ userId, tripId, autonomy });

    if (action === "search") {
      const offers = await agent.searchAndRank(kind ?? "hotel", params ?? {});
      return NextResponse.json({ ok: true, offers });
    }

    if (action === "propose") {
      const decision = await agent.proposeBook(offer as NormalizedOffer);
      return NextResponse.json({ ok: true, decision, offer, rainConfigured: isRainConfigured() });
    }

    if (action === "book") {
      const result = await agent.confirmBook(offer as NormalizedOffer, !!approved);
      return NextResponse.json({ ok: true, rainConfigured: isRainConfigured(), ...result });
    }

    if (action === "history") {
      if (!isRainConfigured()) {
        return NextResponse.json({
          ok: true,
          rainConfigured: false,
          purchases: [],
          message: "Rain not configured — set RAIN_API_KEY, RAIN_USER_ID, RAIN_CONTRACT_ID",
        });
      }
      const purchases = await purchaseHistory(Number(body.limit ?? 20));
      return NextResponse.json({ ok: true, rainConfigured: true, purchases });
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
