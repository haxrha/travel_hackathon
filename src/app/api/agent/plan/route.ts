import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { Orchestrator, defaultAutonomy } from "@/lib/agents/orchestrator";
import { TravelGraph } from "@/lib/graph/service";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { text, tripId, createTrip } = await req.json();
    let activeTripId = tripId as string | undefined;

    if (createTrip && !activeTripId) {
      const { Orchestrator: Or } = await import("@/lib/agents/orchestrator");
      const _ = Or; // keep tree-shaken imports simple
      const graph = new TravelGraph(userId);
      const t = await graph.createTrip({ title: "WAYPORT trip", destination: "TBD" });
      activeTripId = t.id;
    }

    const orch = new Orchestrator({ userId, tripId: activeTripId, autonomy: defaultAutonomy() });
    const plan = await orch.handleUserMessage(text ?? "Plan a trip to NYC for 4 days, $1500");
    return NextResponse.json({
      ok: true,
      plan,
      tripId: activeTripId,
      options: (plan as any)?.options ?? [],
      rovePick: (plan as any)?.rovePick ?? null,
      grandTotalUsd: (plan as any)?.grandTotalUsd ?? null,
      risk: (plan as any)?.risk ?? null,
      hotelDecision: (plan as any)?.hotelDecision ?? null,
      localDecision: (plan as any)?.localDecision ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
