import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { syncWeatherAndMaybeReplan } from "@/lib/graph/world";

/** Poll OpenWeather → World Model → auto Guardian replan when rain ≥ 60%. */
export async function POST(req: Request) {
  const userId = await requireUserId();
  const body = await req.json().catch(() => ({}));
  const tripId = body.tripId as string | undefined;
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  // Demo force: inject heavy rain even without OpenWeather key
  if (body.forceRain) {
    const { mutateWorld } = await import("@/lib/graph/world");
    const { GuardianAgent } = await import("@/lib/agents/guardian");
    const { defaultAutonomy } = await import("@/lib/agents/orchestrator");
    mutateWorld(tripId, {
      weather: { condition: "rain", tempC: 16, rainChance: 85 },
      inject: "Auto-weather: rain (85% rain) [forced demo]",
    });
    const guardian = new GuardianAgent({ userId, tripId, autonomy: defaultAutonomy() });
    const replan = await guardian.replan("WEATHER_CHANGED", {
      condition: "rain",
      rainChance: 85,
      summary: "Forced rain demo — outdoor swap",
      auto: true,
    });
    return NextResponse.json({
      ok: true,
      weather: { condition: "rain", tempC: 16, rainChance: 85, live: false },
      needsReplan: true,
      replanned: true,
      replan,
    });
  }

  const result = await syncWeatherAndMaybeReplan(userId, tripId, {
    autoReplan: body.autoReplan !== false,
  });
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  const userId = await requireUserId();
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const result = await syncWeatherAndMaybeReplan(userId, tripId, {
    autoReplan: searchParams.get("autoReplan") !== "0",
  });
  return NextResponse.json(result);
}
