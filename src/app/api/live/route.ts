import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { CompanionAgent } from "@/lib/agents/companion";
import { defaultAutonomy } from "@/lib/agents/orchestrator";
import { getOrCreateProfile } from "@/lib/demo/store";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const profile = getOrCreateProfile(userId);
    const agent = new CompanionAgent({
      userId,
      tripId: body.tripId,
      autonomy: { ...defaultAutonomy(), ...profile.autonomy } as any,
    });
    if (body.action === "go_live") {
      await agent.setLiveMode();
      return NextResponse.json({ ok: true, mode: "LIVE" });
    }
    const result = await agent.now({
      localTime: body.localTime,
      neighborhood: body.neighborhood,
      energy: body.energy,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
