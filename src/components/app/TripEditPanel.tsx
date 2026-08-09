"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CHIPS = [
  "Spend $500 more",
  "Leave one day later",
  "Don't want to walk more than 5,000 steps",
  "Prioritize local experiences",
  "Remove the rental car",
  "Maximize rewards",
  "I get tired easily",
  "Avoid rain",
];

export default function TripEditPanel({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [changes, setChanges] = useState<{ action: string; detail: string }[]>([]);

  async function run(override?: string) {
    const q = (override ?? text).trim();
    if (!q || busy) return;
    setBusy(true);
    setSummary(null);
    try {
      const res = await fetch("/api/agent/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, text: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recompute failed");
      setSummary(data.result?.summary ?? "Recomputed");
      setChanges(data.result?.changes ?? []);
      setText("");
      router.refresh();
    } catch (e) {
      setSummary(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wp-card space-y-4 rounded-2xl p-5">
      <div className="wp-eyebrow">Edit trip · natural language</div>
      <p className="text-sm text-text-secondary">
        Tell WAYPORT how the trip should change — it recomputes the Travel Graph.
      </p>
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={busy}
            onClick={() => run(c)}
            className="rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-text-secondary hover:border-ember/40 hover:text-white disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="e.g. spend $500 more, leave a day later…"
          className="flex-1 rounded-full border border-white/15 bg-black/25 px-4 py-2.5 text-sm outline-none focus:border-ember"
        />
        <button onClick={() => run()} disabled={busy} className="wp-cta px-5 text-sm disabled:opacity-50">
          {busy ? "Recomputing…" : "Recompute"}
        </button>
      </div>
      {summary && (
        <div className="rounded-xl bg-black/30 p-3 text-sm text-text-secondary">
          <p className="text-ember">{summary}</p>
          {changes.length > 0 && (
            <ul className="mt-2 space-y-1 font-mono text-[11px]">
              {changes.map((c, i) => (
                <li key={i}>
                  {c.action} · {c.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
