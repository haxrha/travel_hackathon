/**
 * ElevenLabs voice — TTS outcome for hackathon demo + optional agent telephony.
 * With ELEVENLABS_API_KEY: synthesizes spoken call outcome (audio/mpeg).
 * ELEVENLABS_AGENT_ID enables future Conversational AI / telephony handoff.
 */

export interface VoiceCallRequest {
  recipient: string;
  purpose: "late_checkout" | "upgrade" | "modify_reservation" | "cancel" | "question";
  context: Record<string, unknown>;
}

export interface VoiceCallResult {
  callId: string;
  outcome: "approved" | "denied" | "pending" | "failed";
  summary: string;
  recordingUrl?: string;
  audioBase64?: string;
  audioMime?: string;
  nextSteps?: string;
  live: boolean;
}

const PURPOSE_SCRIPT: Record<VoiceCallRequest["purpose"], string> = {
  late_checkout:
    "Hi, this is WAYPORT calling on behalf of the guest. We're requesting a late checkout until 2 PM. The front desk approved it at no charge. Confirmation has been written to the travel graph.",
  upgrade:
    "WAYPORT here — requesting a room upgrade if inventory allows. The hotel offered a complimentary category bump subject to availability at check-in.",
  modify_reservation:
    "Calling to modify the reservation dates. The property confirmed the change and noted a possible rate adjustment on the folio.",
  cancel:
    "Requesting cancellation per traveler policy. The hotel confirmed cancellation within the free window — no penalty.",
  question:
    "Quick question for the property. They answered and the note is saved on the trip graph.",
};

export async function initiateCall(request: VoiceCallRequest): Promise<VoiceCallResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  const summary =
    PURPOSE_SCRIPT[request.purpose] ??
    `Call to ${request.recipient} for ${request.purpose.replace(/_/g, " ")}.`;
  const callId = `el-${Date.now()}`;

  if (!key) {
    return {
      callId: `mock-${Date.now()}`,
      outcome: "approved",
      summary: `Mock call to ${request.recipient} for ${request.purpose.replace(/_/g, " ")} — approved 2 PM checkout at no charge.`,
      nextSteps: "Write outcome to trip graph",
      live: false,
    };
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: summary,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.45, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      callId,
      outcome: "approved",
      summary,
      audioBase64: buf.toString("base64"),
      audioMime: "audio/mpeg",
      nextSteps: "Outcome written to Travel Graph",
      live: true,
      recordingUrl: process.env.ELEVENLABS_AGENT_ID
        ? `https://elevenlabs.io/app/conversational-ai/${process.env.ELEVENLABS_AGENT_ID}`
        : undefined,
    };
  } catch {
    return {
      callId,
      outcome: "approved",
      summary,
      nextSteps: "TTS unavailable — text outcome only",
      live: false,
    };
  }
}
