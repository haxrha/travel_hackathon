import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { Orchestrator, defaultAutonomy } from "@/lib/agents/orchestrator";
import type { TripEventType } from "@/lib/db-types";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { tripId, type, payload } = await req.json();
    const orch = new Orchestrator({ userId, tripId, autonomy: defaultAutonomy() });
    const result = await orch.handleEvent(type as TripEventType, payload ?? {});
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
