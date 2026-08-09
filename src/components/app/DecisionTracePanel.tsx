"use client";

import type { DecisionTrace } from "@/lib/decision/transparency";
import { cn } from "@/lib/utils";

export default function DecisionTracePanel({ decision }: { decision: DecisionTrace }) {
  return (
    <div className="wp-card space-y-3 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="wp-eyebrow">
          {decision.agent} · {decision.tool}
        </div>
        <span className="text-[10px] uppercase tracking-widest text-ok">Decision</span>
      </div>
      <p className="text-sm text-text-secondary">{decision.question}</p>
      <p className="text-sm text-ember">{decision.summary}</p>

      <ul className="space-y-2">
        {decision.candidates.slice(0, 4).map((c, i) => (
          <li
            key={c.id}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-sm",
              i === 0 ? "border-ember/40 bg-ember/10" : "border-white/10",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">
                {i === 0 ? "✓ " : ""}
                {c.title}
              </span>
              <span className="font-mono text-xs text-ember">{c.score}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-text-tertiary">
              {c.factors.slice(0, 5).map((f) => (
                <span key={f.key} className="rounded-full bg-black/30 px-2 py-0.5">
                  {f.label} {f.value}
                </span>
              ))}
            </div>
            {i > 0 && c.rejectedReason && (
              <p className="mt-1.5 text-[11px] text-text-tertiary">{c.rejectedReason}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
