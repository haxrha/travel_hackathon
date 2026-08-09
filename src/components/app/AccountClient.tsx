"use client";

import { useState } from "react";
import Link from "next/link";

type Profile = {
  name: string;
  email: string;
  homeAirport: string;
  preferences: string[];
  autonomy: { mode: string };
};

export default function AccountClient({ profile: initial }: { profile: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(false);

  async function save() {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.name,
        email: profile.email,
        homeAirport: profile.homeAirport,
        preferences: profile.preferences,
      }),
    });
    setSaved(true);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="wp-card space-y-4 rounded-2xl p-6">
        <div className="wp-eyebrow">Profile</div>
        <Field label="Name" value={profile.name} onChange={(v) => { setProfile((p) => ({ ...p, name: v })); setSaved(false); }} />
        <Field label="Email" value={profile.email} onChange={(v) => { setProfile((p) => ({ ...p, email: v })); setSaved(false); }} />
        <Field label="Home airport" value={profile.homeAirport} onChange={(v) => { setProfile((p) => ({ ...p, homeAirport: v })); setSaved(false); }} />
        <Field
          label="Preferences (comma-separated)"
          value={profile.preferences.join(", ")}
          onChange={(v) => {
            setProfile((p) => ({ ...p, preferences: v.split(",").map((s) => s.trim()).filter(Boolean) }));
            setSaved(false);
          }}
        />
        <button onClick={save} className="wp-cta px-5 py-2.5 text-sm">
          {saved ? "Saved" : "Save profile"}
        </button>
      </section>

      <section className="wp-card rounded-2xl p-6">
        <div className="wp-eyebrow">Settings shortcuts</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href="/app/dna" className="rounded-xl border border-white/10 px-4 py-3 text-sm hover:border-ember/40">
            Travel DNA
          </Link>
          <Link href="/app/autonomy" className="rounded-xl border border-white/10 px-4 py-3 text-sm hover:border-ember/40">
            Autonomy · {profile.autonomy.mode.replace(/_/g, " ")}
          </Link>
          <Link href="/app/wallet" className="rounded-xl border border-white/10 px-4 py-3 text-sm hover:border-ember/40">
            Travel Wallet
          </Link>
          <Link href="/app/money" className="rounded-xl border border-white/10 px-4 py-3 text-sm hover:border-ember/40">
            Money & budgets
          </Link>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-text-secondary">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-2.5 outline-none focus:border-ember"
      />
    </label>
  );
}
