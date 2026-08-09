import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { runEvalHarness } from "@/lib/eval/harness";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";

export async function POST(req: Request) {
  const userId = await requireUserId();
  const body = await req.json().catch(() => ({}));
  let tripId = body.tripId as string | undefined;
  if (!tripId && isMemoryGraph()) {
    tripId = demoStore.listTrips(userId)[0]?.id;
  }
  if (!tripId) return NextResponse.json({ error: "tripId required — plan a trip first" }, { status: 400 });

  const take = Math.min(10, Number(body.take ?? 10));
  const report = await runEvalHarness(userId, tripId, take);
  return NextResponse.json({ ok: true, report });
}
