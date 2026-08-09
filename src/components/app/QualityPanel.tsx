"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { OptimizeFor } from "@/lib/decision/engine";

const MODES: { id: OptimizeFor; label: string }[] = [
  { id: "balanced", label: "⚖️ Balanced" },
  { id: "cheapest", label: "💰 Cheapest" },
  { id: "fastest", label: "⚡ Fastest" },
  { id: "experience", label: "❤️ Experience" },
  { id: "greenest", label: "🌱 Greenest" },
  { id: "relaxed", label: "🧘 Relaxed" },
  { id: "local", label: "📍 Local" },
];

export default function QualityPanel({ tripId }: { tripId: string }) {
  const [optimizeFor, setOptimizeFor] = useState<OptimizeFor>("balanced");
  const [quality, setQuality] = useState<Record<string, number> | null>(null);
  const [soft, setSoft] = useState<string[]>([]);
  const [hard, setHard] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/world?tripId=${tripId}&optimizeFor=${optimizeFor}`)
      .then((r) => r.json())
      .then((d) => {
        setQuality(d.model?.quality ?? null);
        setSoft(d.model?.soft?.notes ?? []);
        setHard(d.model?.hardViolations ?? []);
      });
  }, [tripId, optimizeFor]);

  const dims = quality
    ? [
        ["Experience", quality.experience],
        ["Personalization", quality.personalization],
        ["Value", quality.value],
        ["Convenience", quality.convenience],
        ["Sustainability", quality.sustainability],
        ["Accessibility", quality.accessibility],
        ["Localness", quality.localness],
        ["Energy", quality.energy],
        ["Crowds", quality.crowds],
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setOptimizeFor(m.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs",
              optimizeFor === m.id ? "bg-ember text-[#1a100c]" : "bg-white/5 ring-1 ring-white/10",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {quality && (
        <div className="wp-card rounded-2xl p-6">
          <div className="flex items-end justify-between">
            <div className="wp-eyebrow">Trip quality vector</div>
            <div className="text-2xl font-semibold text-ember">{quality.total}</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {dims.map(([label, val]) => (
              <div key={label as string}>
                <div className="flex justify-between text-xs text-text-tertiary">
                  <span>{label}</span>
                  <span>{val as number}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-ember" style={{ width: `${Math.min(100, val as number)}%` }} />
                </div>
              </div>
            ))}
          </div>
          {soft.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-text-secondary">
              {soft.map((n, i) => (
                <li key={i}>Soft · {n}</li>
              ))}
            </ul>
          )}
          {hard.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-err">
              {hard.map((n, i) => (
                <li key={i}>Hard · {n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
