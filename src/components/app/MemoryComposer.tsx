"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MemoryComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      const learned = (data.learned ?? []).map((f: { content: string }) => f.content).join(" · ");
      setNote(learned ? `Stored: ${learned}` : "No new durable preference in that note.");
      setText("");
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wp-card space-y-3 p-6">
      <h2 className="wp-section-title">Teach the assistant</h2>
      <p className="text-sm text-text-tertiary">
        Same write path as trip planning: memory Auto when Backboard is configured.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="I prefer aisle seats and I won't do red-eyes."
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none"
      />
      <button type="button" onClick={save} disabled={busy} className="wp-cta px-5 py-2.5 text-sm disabled:opacity-50">
        {busy ? "Saving…" : "Remember this"}
      </button>
      {note && <p className="text-xs text-text-secondary">{note}</p>}
    </section>
  );
}
