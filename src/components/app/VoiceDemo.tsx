"use client";

import { useRef, useState } from "react";

export default function VoiceDemo({ tripId, hotelName }: { tripId: string; hotelName?: string }) {
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function requestCall() {
    setBusy(true);
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, purpose: "late_checkout", hotel: hotelName, approved: false }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.pending) {
      setPending(true);
      return;
    }
    await playResult(data.result ?? data);
  }

  async function approve() {
    setBusy(true);
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, purpose: "late_checkout", hotel: hotelName, approved: true }),
    });
    const data = await res.json();
    setBusy(false);
    setPending(false);
    await playResult(data.result);
  }

  async function playResult(result: any) {
    if (!result) return;
    setSummary(result.summary);
    setLive(!!result.live);
    if (result.audioBase64) {
      const url = `data:${result.audioMime || "audio/mpeg"};base64,${result.audioBase64}`;
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play().catch(() => {});
      }
    }
  }

  return (
    <div className="wp-card space-y-3 rounded-2xl p-5">
      <div className="wp-eyebrow">Voice · late checkout</div>
      <p className="text-sm text-text-secondary">
        Policy gates external calls. Approve once — ElevenLabs speaks the outcome onto the graph.
      </p>
      <div className="flex flex-wrap gap-2">
        {!pending ? (
          <button onClick={requestCall} disabled={busy} className="wp-cta px-4 py-2 text-xs disabled:opacity-50">
            {busy ? "Calling…" : "Call hotel"}
          </button>
        ) : (
          <button onClick={approve} disabled={busy} className="wp-cta px-4 py-2 text-xs disabled:opacity-50">
            {busy ? "Connecting…" : "Approve Level-4 call"}
          </button>
        )}
      </div>
      {summary && (
        <div className="rounded-xl bg-black/30 p-3 text-sm text-text-secondary">
          <span className={live ? "text-ok" : "text-text-tertiary"}>{live ? "Live TTS" : "Mock"}</span>
          <p className="mt-1">{summary}</p>
        </div>
      )}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
