"use client";

import { useEffect, useState } from "react";
import BookingReview from "@/components/app/BookingReview";
import { formatCurrency } from "@/lib/utils";

export default function LiveCompanionClient({ tripId, destination }: { tripId: string; destination: string }) {
  const [energy, setEnergy] = useState<"low" | "medium" | "high">("medium");
  const [neighborhood, setNeighborhood] = useState(destination.split(",")[0] ?? destination);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);

  async function goLive() {
    await fetch("/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "go_live", tripId }),
    });
    // Pull OpenWeather into world; auto-replan outdoor plan if rain ≥ 60%
    await fetch("/api/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, autoReplan: true }),
    }).catch(() => {});
    setLive(true);
  }

  async function ask() {
    setLoading(true);
    const now = new Date();
    const localTime = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    const res = await fetch("/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, localTime, neighborhood, energy }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  useEffect(() => {
    goLive().then(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded-full px-3 py-1 ${live ? "bg-ok/15 text-ok" : "bg-white/10"}`}>
          {live ? "LIVE mode" : "Arming…"}
        </span>
        <label className="flex items-center gap-2 text-text-secondary">
          Energy
          <select
            value={energy}
            onChange={(e) => setEnergy(e.target.value as any)}
            className="rounded-lg border border-white/15 bg-black/30 px-2 py-1"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <input
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5"
          placeholder="Neighborhood"
        />
        <button onClick={ask} disabled={loading} className="wp-cta px-4 py-1.5 text-xs">
          {loading ? "Thinking…" : "What now?"}
        </button>
      </div>

      {result?.advice && (
        <div className="wp-card rounded-2xl p-6 space-y-2">
          <div className="wp-eyebrow">Context</div>
          {result.advice.map((line: string, i: number) => (
            <p key={i} className="text-sm text-text-secondary">
              {line}
            </p>
          ))}
          {result.navigation && (
            <p className="mt-3 text-sm text-ember">
              Nav · {result.navigation.etaMinutes} min — {result.navigation.route}
            </p>
          )}
          {result.airport?.tip && <p className="text-xs text-text-tertiary">Airport · {result.airport.tip}</p>}
        </div>
      )}

      {result?.suggestion && (
        <div className="space-y-4">
          <div className="wp-card rounded-2xl p-5">
            <div className="wp-eyebrow">Contextual discovery</div>
            <h3 className="mt-2 font-medium">{result.suggestion.title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{result.suggestion.subtitle}</p>
            <p className="mt-2 text-ember text-sm">{formatCurrency(result.suggestion.priceUsd)}</p>
          </div>
          <BookingReview tripId={tripId} offer={result.suggestion} />
        </div>
      )}
    </div>
  );
}
