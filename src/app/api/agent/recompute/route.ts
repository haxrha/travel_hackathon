import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";
import { parseEditIntent, applyEditToItems } from "@/lib/graph/recompute";
import { emitTrace } from "@/lib/agents/trace";
import { day0DinnerRiskDecision } from "@/lib/decision/risk";

/** Natural-language trip edit → recompute Travel Graph. */
export async function POST(req: Request) {
  const userId = await requireUserId();
  const body = await req.json().catch(() => ({}));
  const tripId = body.tripId as string | undefined;
  const text = String(body.text ?? "").trim();
  if (!tripId || !text) return NextResponse.json({ error: "tripId and text required" }, { status: 400 });

  emitTrace({ tripId, agent: "RECOMPUTE", step: "Parsing edit", detail: text.slice(0, 80), status: "running" });

  const intent = parseEditIntent(text);
  emitTrace({
    tripId,
    agent: "RECOMPUTE",
    step: "Constraints extracted",
    detail: intent.notes.join(" · "),
    status: "ok",
  });

  if (isMemoryGraph()) {
    const trip = demoStore.getTrip(userId, tripId);
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    const budget = trip.budgets?.[0]
      ? {
          totalBudget: Number(trip.budgets[0].totalBudget),
          actual: Number(trip.budgets[0].actual),
          remaining: Number(trip.budgets[0].remaining),
        }
      : { totalBudget: 3000, actual: 0, remaining: 3000 };

    const result = applyEditToItems(trip.items as any, intent, budget);
    if (trip.budgets?.[0]) {
      trip.budgets[0].totalBudget = budget.totalBudget;
      trip.budgets[0].actual = budget.actual;
      trip.budgets[0].remaining = budget.remaining;
    }
    // Re-assert risk dinner if rain / energy didn't wipe restaurants
    if (intent.avoidRain || intent.lowEnergy) {
      const risk = day0DinnerRiskDecision();
      demoStore.setTripMeta(tripId, { risk, lastEdit: intent });
    } else {
      demoStore.setTripMeta(tripId, { lastEdit: intent, lastRecompute: result });
    }

    demoStore.logAction({
      userId,
      tripId,
      agent: "RECOMPUTE",
      action: "nl_edit",
      tool: "graph",
      input: { text, intent },
      result: result as any,
      status: "EXECUTED",
    });
    demoStore.addAlert(tripId, {
      title: "Trip recomputed",
      body: result.summary,
      severity: "INFO",
    });

    emitTrace({ tripId, agent: "RECOMPUTE", step: "Graph updated", detail: result.summary, status: "ok" });

    return NextResponse.json({
      ok: true,
      intent,
      result,
      trip: demoStore.getTrip(userId, tripId),
    });
  }

  const graph = new TravelGraph(userId);
  const trip = await graph.getTrip({ tripId });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  // Prisma path: apply soft mutations via notes on first matching items (demo-lite)
  const result = applyEditToItems(trip.items as any, intent);
  emitTrace({ tripId, agent: "RECOMPUTE", step: "Graph updated (db)", detail: result.summary, status: "ok" });
  return NextResponse.json({ ok: true, intent, result });
}
