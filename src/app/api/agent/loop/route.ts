import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { runReplanningLoop } from "@/lib/replan/loop";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { tripId } = await req.json();
    if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
    const result = await runReplanningLoop(userId, tripId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
