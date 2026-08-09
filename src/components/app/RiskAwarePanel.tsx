"use client";

import type { RiskDecision } from "@/lib/decision/risk";
import { cn } from "@/lib/utils";

export default function RiskAwarePanel({ risk }: { risk: RiskDecision }) {
  const chosen = risk.options.find((o) => o.chosen);
  return (
    <div className="wp-card space-y-4 rounded-2xl p-5">
      <div className="wp-eyebrow">Risk-aware planning</div>
      <p className="text-sm text-text-secondary">
        Arrival isn&apos;t a point ETA — it&apos;s a distribution. Dinner is scored by P(success).
      </p>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-text-tertiary">Flight arrival</div>
        <ul className="mt-2 space-y-1.5 font-mono text-xs text-text-secondary">
          {risk.arrival.map((b) => (
            <li key={b.label} className="flex justify-between gap-4">
              <span>{b.label}</span>
              <span className="text-ember">{Math.round(b.probability * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {risk.options.map((o) => (
          <div
            key={o.id}
            className={cn(
              "rounded-xl border p-3 text-sm",
              o.chosen ? "border-ember/50 bg-ember/10" : "border-white/10 opacity-70",
            )}
          >
            {o.chosen && <div className="text-[10px] uppercase tracking-widest text-ember">Chosen</div>}
            {!o.chosen && <div className="text-[10px] uppercase tracking-widest text-text-tertiary">Rejected</div>}
            <div className="mt-1 font-medium">{o.label}</div>
            <div className="mt-2 text-2xl text-ember">{o.successProbability}%</div>
            <div className="text-[11px] text-text-tertiary">success probability</div>
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-text-secondary">
        {risk.rationale}
        {chosen ? ` WAYPORT locked ${chosen.label}.` : ""}
      </p>
    </div>
  );
}
