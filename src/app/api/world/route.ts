import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { buildWorldModel } from "@/lib/graph/world";
import type { OptimizeFor } from "@/lib/decision/engine";

export async function GET(req: Request) {
  const userId = await requireUserId();
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") ?? undefined;
  const optimizeFor = (searchParams.get("optimizeFor") as OptimizeFor) || "balanced";
  const model = await buildWorldModel(userId, tripId, optimizeFor);
  return NextResponse.json({ ok: true, model });
}
