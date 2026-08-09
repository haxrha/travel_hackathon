"use client";

import { motion } from "framer-motion";

/**
 * Hero mockup: the organizer's view of a live program. Deliberately mirrors the
 * real /app/programs/[id] layout — blockers, KPI row, roster, convergence — so
 * the landing page is showing the product rather than an illustration of it.
 */
export default function TripCommandPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: "easeOut" }}
      className="wp-glass relative overflow-hidden rounded-3xl"
    >
      {/* Chrome */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        </div>
        <span className="wp-eyebrow">Engineering Offsite — Lisbon</span>
        <span className="wp-badge wp-badge-accent hidden sm:inline-flex">12 travelers</span>
      </div>

      <div className="grid md:grid-cols-[196px,1fr]">
        {/* Sidebar */}
        <div className="hidden space-y-1 border-r border-white/10 bg-black/25 p-4 md:block">
          <div className="wp-eyebrow mb-2 px-2 text-[10px]">Company</div>
          {["Programs", "Travelers", "Advisor"].map((t, i) => (
            <div
              key={t}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                i === 0 ? "bg-ember/12 text-white" : "text-text-secondary"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-ember" : "bg-white/25"}`} />
              {t}
            </div>
          ))}
          <div className="wp-eyebrow mb-2 mt-5 px-2 text-[10px]">Trip</div>
          {["Command Center", "Trips", "AI Concierge", "Alerts"].map((t) => (
            <div
              key={t}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
              {t}
            </div>
          ))}
        </div>

        {/* Stage */}
        <div className="wp-stage relative p-5 md:p-6">
          {/* Blocker strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/25 bg-warn/8 px-4 py-3">
            <span className="wp-dot-mark text-warn" />
            <span className="text-sm text-text-primary">3 approvals waiting on you</span>
            <span className="text-xs text-text-tertiary">· $1,240 in policy overage</span>
          </div>

          {/* KPI row */}
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Stat label="Confirmed" value="9/12" hint="75% responded" />
            <Stat label="Projected" value="$28,410" hint="of $32,000" />
            <Stat label="Remaining" value="$3,590" hint="$2,367 / traveler" tone="ok" />
            <Stat label="Transfers" value="3" hint="2 vans · saves $410" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1.35fr,1fr]">
            {/* Roster */}
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="wp-eyebrow mb-3">Roster</div>
              {[
                ["Dana Whitfield", "SFO", "Booked", "ok"],
                ["Priya Raghunathan", "JFK", "Booked", "ok"],
                ["Nadia Haddad", "ORD", "Needs approval", "warn"],
                ["Grace Mbeki", "AMS", "Needs approval", "warn"],
                ["Isabel Moreau", "CDG", "Awaiting RSVP", "neutral"],
              ].map(([name, origin, status, tone]) => (
                <div
                  key={name}
                  className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0"
                >
                  <span className="wp-avatar !h-7 !w-7 !text-[10px]">
                    {name.split(" ").map((w) => w[0]).join("")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="font-mono text-[11px] text-text-tertiary">{origin}</span>
                  <span className={`wp-badge wp-badge-${tone} !text-[10px]`}>{status}</span>
                </div>
              ))}
            </div>

            {/* Convergence */}
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="wp-eyebrow mb-3">Arrival convergence</div>
              {[
                ["08:40 – 09:25", "4 travelers", "1 van"],
                ["11:10 – 12:05", "5 travelers", "1 van"],
                ["16:30", "2 travelers", "1 van"],
              ].map(([window, who, vans]) => (
                <div
                  key={window}
                  className="flex items-baseline gap-3 border-b border-white/5 py-2.5 last:border-0"
                >
                  <span className="font-mono text-[11px] text-text-tertiary">{window}</span>
                  <span className="flex-1 text-sm">{who}</span>
                  <span className="text-xs text-text-tertiary">{vans}</span>
                </div>
              ))}
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-ok/10 px-3 py-2 text-xs text-ok">
                <span className="wp-dot-mark" />
                12 arrivals collapsed into 3 transfers
              </div>
            </div>
          </div>

          {/* Policy footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-sky-900/40 to-horizon-900/30 p-4">
            <div>
              <div className="wp-eyebrow">Policy tier</div>
              <div className="mt-1 text-sm">Standard (IC) · ENG-1042</div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-text-secondary">
              <span className="h-2 w-2 rounded-full bg-ok" />
              Airfare &lt; $550 · Lodging &lt; $260 · 14d advance
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3.5">
      <div className="wp-stat-label">{label}</div>
      <div
        className={`font-display mt-1.5 text-xl font-semibold tabular-nums ${
          tone === "ok" ? "text-ok" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-text-tertiary">{hint}</div>
    </div>
  );
}
