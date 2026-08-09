import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { VoiceAgent } from "@/lib/agents/voice";
import { defaultAutonomy } from "@/lib/agents/orchestrator";
import { emitTrace } from "@/lib/agents/trace";
import { mutateWorld } from "@/lib/graph/world";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";
import { initiateCall } from "@/lib/tools/voice/elevenlabs";
import { emitEvent } from "@/lib/events/bus";

/**
 * Voice outcome demo — late checkout call.
 * Pass { approved: true } to execute past Policy Level-4 gate (explicit user click).
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  const body = await req.json().catch(() => ({}));
  const tripId = body.tripId as string | undefined;
  const purpose = (body.purpose as "late_checkout" | "upgrade" | "modify_reservation" | "cancel" | "question") || "late_checkout";
  const approved = body.approved === true;

  emitTrace({
    tripId,
    agent: "VOICE",
    step: "Preparing hotel call",
    detail: purpose.replace(/_/g, " "),
    status: "running",
  });

  if (!approved) {
    const agent = new VoiceAgent({ userId, tripId, autonomy: defaultAutonomy() });
    const gated = await agent.callHotel(purpose, { tripId, hotel: body.hotel ?? "property front desk" });
    if ((gated as any).pending) {
      emitTrace({
        tripId,
        agent: "POLICY",
        step: "External comm needs approval",
        detail: (gated as any).reason,
        status: "warn",
      });
      return NextResponse.json({ ok: true, pending: true, reason: (gated as any).reason });
    }
    return NextResponse.json({ ok: true, ...gated });
  }

  // Explicit user approval — run call + write graph
  const result = await initiateCall({
    recipient: String(body.hotel ?? "hotel_front_desk"),
    purpose,
    context: { tripId, approvedByUser: true },
  });

  emitTrace({
    tripId,
    agent: "VOICE",
    step: result.live ? "ElevenLabs TTS outcome ready" : "Mock voice outcome",
    detail: result.summary.slice(0, 100),
    status: "ok",
  });

  if (tripId) {
    mutateWorld(tripId, { inject: `Voice: ${purpose} → ${result.outcome}` });
    await emitEvent(tripId, "VOICE_CALL_COMPLETED", result as unknown as Record<string, unknown>);
    if (isMemoryGraph()) {
      demoStore.addAlert(tripId, {
        title: "Voice call completed",
        body: result.summary,
        severity: "INFO",
      });
      demoStore.logAction({
        userId,
        tripId,
        agent: "VOICE",
        action: "call_hotel",
        tool: "elevenlabs",
        status: "EXECUTED",
        input: { purpose, approved: true },
        result: result as any,
      });
    }
  }

  return NextResponse.json({ ok: true, pending: false, result });
}
