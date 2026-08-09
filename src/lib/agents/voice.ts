import { BaseAgent } from "./base";
import { initiateCall } from "../tools/voice/elevenlabs";
import { emitEvent } from "../events/bus";

export class VoiceAgent extends BaseAgent {
  kind = "VOICE" as const;

  async callHotel(purpose: "late_checkout" | "upgrade" | "modify_reservation" | "cancel" | "question", context: Record<string, unknown>) {
    const gate = this.check({
      agent: this.kind,
      tool: "elevenlabs",
      action: "call_hotel",
      isExternalComm: true,
      metadata: { purpose },
    });
    if (!gate.allowed) {
      await this.logAction({
        action: "call_hotel",
        tool: "elevenlabs",
        input: context,
        decision: gate as unknown as Record<string, unknown>,
        status: "PENDING_APPROVAL",
      });
      return { pending: true, reason: gate.reason };
    }

    const result = await initiateCall({ recipient: "hotel_front_desk", purpose, context });
    await this.logAction({
      action: "call_hotel",
      tool: "elevenlabs",
      input: context,
      result: result as unknown as Record<string, unknown>,
      status: "EXECUTED",
    });

    if (this.ctx.tripId) {
      await emitEvent(this.ctx.tripId, "VOICE_CALL_COMPLETED", result as unknown as Record<string, unknown>);
    }
    return result;
  }
}
