"use client";

import { useState } from "react";

const MODES = [
  { id: "suggest", label: "Suggest", desc: "WAYPORT only recommends; you execute." },
  { id: "prepare", label: "Prepare", desc: "Drafts bookings and itineraries; you confirm." },
  { id: "execute_with_approval", label: "Execute with approval", desc: "Acts autonomously, asks before spending." },
  { id: "execute_automatic", label: "Execute automatically", desc: "Full autonomy within your rules." },
] as const;

export default function AutonomyClient({
  initial,
}: {
  initial: {
    mode: string;
    autoBookHotelUnder: number;
    autoBookFlightUnder: number;
    autoBookChangesUnder: number;
    allowInternationalFlights: boolean;
    autoBookRestaurants: boolean;
  };
}) {
  const [mode, setMode] = useState(initial.mode);
  const [settings, setSettings] = useState({
    hotel: initial.autoBookHotelUnder,
    flight: initial.autoBookFlightUnder,
    changes: initial.autoBookChangesUnder,
    international: initial.allowInternationalFlights,
    restaurant: initial.autoBookRestaurants,
  });
  const [saved, setSaved] = useState(false);

  async function save() {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autonomy: {
          mode,
          autoBookHotelUnder: settings.hotel,
          autoBookFlightUnder: settings.flight,
          autoBookChangesUnder: settings.changes,
          allowInternationalFlights: settings.international,
          autoBookRestaurants: settings.restaurant,
          notifyOnlyImportantDisruptions: true,
        },
      }),
    });
    setSaved(true);
  }

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl text-text-secondary">Guardrails the Orchestrator respects before acting on your Travel Graph.</p>
        <button onClick={save} className="wp-cta px-5 py-2.5 text-sm">
          {saved ? "Saved" : "Save settings"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="wp-card space-y-3 rounded-2xl p-6 md:p-8">
          <h3 className="wp-eyebrow">Mode</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODES.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition hover:bg-white/5 ${
                  mode === m.id ? "border-ember/50 bg-ember/10" : "border-white/10"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === m.id}
                  onChange={() => {
                    setMode(m.id);
                    setSaved(false);
                  }}
                  className="mt-1 accent-[#e8905a]"
                />
                <div>
                  <div className="font-medium">{m.label}</div>
                  <div className="mt-1 text-sm text-text-secondary">{m.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="wp-card space-y-6 rounded-2xl p-6 md:p-8">
          <h3 className="wp-eyebrow">Spend & booking limits</h3>
          <div className="grid gap-6 sm:grid-cols-2">
            <Num
              label="Auto-book hotels under"
              suffix="/night"
              value={settings.hotel}
              onChange={(v) => {
                setSettings((s) => ({ ...s, hotel: v }));
                setSaved(false);
              }}
            />
            <Num
              label="Auto-book flights under"
              value={settings.flight}
              onChange={(v) => {
                setSettings((s) => ({ ...s, flight: v }));
                setSaved(false);
              }}
            />
            <Num
              label="Auto-apply changes under"
              value={settings.changes}
              onChange={(v) => {
                setSettings((s) => ({ ...s, changes: v }));
                setSaved(false);
              }}
            />
          </div>
          <div className="grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
            <Toggle
              label="Auto-book restaurants"
              value={settings.restaurant}
              onChange={(v) => {
                setSettings((s) => ({ ...s, restaurant: v }));
                setSaved(false);
              }}
            />
            <Toggle
              label="International flights"
              value={settings.international}
              onChange={(v) => {
                setSettings((s) => ({ ...s, international: v }));
                setSaved(false);
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Num({ label, suffix, value, onChange }: { label: string; suffix?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-sm text-text-secondary">{label}</label>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-text-tertiary">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
          className="w-full max-w-[10rem] rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 outline-none focus:border-ember"
        />
        {suffix && <span className="text-sm text-text-tertiary">{suffix}</span>}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 px-4 py-3 hover:bg-white/5">
      <span className="text-sm text-text-secondary">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[#e8905a]" />
    </label>
  );
}
