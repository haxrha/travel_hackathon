"use client";

import { useEffect, useState } from "react";
import BookingReview from "@/components/app/BookingReview";
import AgentTracePanel from "@/components/app/AgentTracePanel";

const SCENARIOS = [
  { id: "delay", label: "Delay flight +3 hours", type: "FLIGHT_DELAYED", payload: { delayMinutes: 180, summary: "Outbound delayed 3 hours" } },
  { id: "cancel-hotel", label: "Cancel hotel", type: "RESERVATION_CANCELLED", payload: { provider: "stay22", summary: "Hotel cancelled by property" } },
  { id: "rain", label: "Heavy rain tomorrow", type: "WEATHER_CHANGED", payload: { condition: "rain", hoursAhead: 28, summary: "Heavy rain window" } },
  { id: "closed", label: "Restaurant closes", type: "USER_PREFERENCE_CHANGED", payload: { reason: "closure", summary: "Reservation venue closed" } },
  { id: "price", label: "Price drops $120", type: "HOTEL_PRICE_CHANGED", payload: { priceDrop: true, savedUsd: 120, summary: "Hotel dropped $120" } },
  { id: "tired", label: `Traveler says "I'm exhausted"`, type: "USER_PREFERENCE_CHANGED", payload: { note: "reduce energy", summary: "Lower energy day" } },
];

export default function SandboxClient({ tripId }: { tripId?: string }) {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pipeline, setPipeline] = useState<string[]>([]);
  const [alts, setAlts] = useState<any[]>([]);
  const [rec, setRec] = useState<any>(null);
  const [world, setWorld] = useState<any>(null);

  async function refreshWorld() {
    if (!tripId) return;
    const res = await fetch(`/api/world?tripId=${tripId}`);
    const data = await res.json();
    setWorld(data.model);
  }

  useEffect(() => {
    refreshWorld();
  }, [tripId]);

  async function run(s: (typeof SCENARIOS)[number]) {
    if (!tripId) {
      setLog((l) => [...l, "No trip on graph — plan one in Concierge first."]);
      return;
    }
    setBusy(true);
    setAlts([]);
    setRec(null);
    setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${s.label}`]);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, type: s.type, payload: s.payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const r = data.result;
      setPipeline(r?.pipeline ?? []);
      setAlts(r?.alternatives ?? []);
      setRec(r?.recommendation ?? null);
      setLog((l) => [
        ...l,
        `  → Guardian handled ${s.type}`,
        r?.affected?.length ? `  → Affected: ${r.affected.slice(0, 2).join(" · ")}` : "  → Graph checked",
      ]);
      await refreshWorld();
    } catch (e) {
      setLog((l) => [...l, `  ✗ ${e instanceof Error ? e.message : "error"}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-8">
      {!tripId && <p className="text-sm text-text-secondary">Create a trip in Concierge first.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="wp-card rounded-2xl p-6">
          <div className="wp-eyebrow">Trip state</div>
          {world?.trip ? (
            <ul className="mt-3 space-y-1 text-sm text-text-secondary">
              <li>{world.trip.title} · {world.trip.destination}</li>
              <li>Budget ${world.trip.budgetUsd} · Spent ${Math.round(world.trip.spentUsd)}</li>
              <li>Weather {world.world?.weather?.condition} · rain {world.world?.weather?.rainChance}%</li>
              <li>Flight {world.world?.flightStatus?.delayed ? `delayed ${world.world.flightStatus.delayMinutes}m` : "on time"}</li>
              <li>Disruptions: {(world.world?.disruptions ?? []).slice(-3).join("; ") || "none"}</li>
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-tertiary">No world model yet.</p>
          )}
        </div>

        <div className="wp-card rounded-2xl p-6">
          <div className="wp-eyebrow">Event injection</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                disabled={busy}
                onClick={() => run(s)}
                className="rounded-xl border border-white/10 px-3 py-3 text-left text-sm hover:border-ember/40 disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pipeline.length > 0 && (
        <div className="wp-card rounded-2xl p-6">
          <div className="wp-eyebrow">Agent pipeline (real)</div>
          <ol className="mt-3 space-y-1 font-mono text-xs text-text-secondary">
            {pipeline.map((p, i) => (
              <li key={i}>
                {i + 1}. {p}
              </li>
            ))}
          </ol>
        </div>
      )}

      {alts.length > 0 && (
        <div className="space-y-4">
          <div className="wp-eyebrow">Replacement offers (live search → mock book)</div>
          <div className="grid gap-3 md:grid-cols-3">
            {alts.map((a: any) => (
              <div key={a.id} className={`rounded-2xl border p-4 text-sm ${rec?.id === a.id ? "border-ember/50 bg-ember/10" : "border-white/10"}`}>
                {rec?.id === a.id && <div className="text-[10px] uppercase tracking-widest text-ember">Best fit</div>}
                <div className="font-medium">{a.title}</div>
                <div className="mt-1 text-ember">${a.priceUsd}</div>
                {a.effective && <div className="text-xs text-text-tertiary">Effective ${a.effective.effectiveUsd}</div>}
              </div>
            ))}
          </div>
          {rec && tripId && <BookingReview tripId={tripId} offer={rec} />}
        </div>
      )}

      <div className="wp-card rounded-2xl p-6">
        <div className="wp-eyebrow">Event stream</div>
        <ul className="mt-3 space-y-1 font-mono text-sm text-text-secondary">
          {log.length === 0 ? <li>Inject an event to run the real Guardian pipeline.</li> : log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !tripId}
          onClick={async () => {
            if (!tripId) return;
            setBusy(true);
            setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] Sync OpenWeather…`]);
            try {
              const res = await fetch("/api/weather", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tripId, autoReplan: true }),
              });
              const data = await res.json();
              setLog((l) => [
                ...l,
                `  → Weather ${data.weather?.condition} · rain ${data.weather?.rainChance}%${data.weather?.live ? " (live)" : " (mock)"}`,
                data.replanned ? "  → Auto Guardian replan fired" : "  → No auto-replan needed",
              ]);
              if (data.replan?.pipeline) setPipeline(data.replan.pipeline);
              await refreshWorld();
            } catch (e) {
              setLog((l) => [...l, `  ✗ ${e instanceof Error ? e.message : "error"}`]);
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-xl border border-ember/40 px-4 py-2 text-sm text-ember hover:bg-ember/10 disabled:opacity-50"
        >
          Sync live weather → auto-replan
        </button>
        <button
          type="button"
          disabled={busy || !tripId}
          onClick={async () => {
            if (!tripId) return;
            setBusy(true);
            setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] Force rain demo…`]);
            try {
              const res = await fetch("/api/weather", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tripId, forceRain: true }),
              });
              const data = await res.json();
              setPipeline(data.replan?.pipeline ?? []);
              setLog((l) => [...l, "  → Auto Guardian replan (forced rain ≥ 60%)"]);
              await refreshWorld();
            } catch (e) {
              setLog((l) => [...l, `  ✗ ${e instanceof Error ? e.message : "error"}`]);
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm text-text-secondary hover:border-ember/30 disabled:opacity-50"
        >
          Force rain → replan
        </button>
      </div>

      <AgentTracePanel tripId={tripId} />
    </div>
  );
}
