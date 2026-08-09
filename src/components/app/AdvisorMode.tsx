"use client";

import { useState } from "react";

/**
 * WAYPORT PRO — travel advisor mode.
 * AI does the research; human owns the relationship.
 */
export default function AdvisorMode() {
  const [brief, setBrief] = useState("Family of 5. Japan. 12 days. $15k. Two kids. Luxury hotels. Need vegetarian food.");
  const [proposal, setProposal] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setProposal(null);
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Advisor client brief: ${brief}. Produce a polished multi-city itinerary proposal.`,
          createTrip: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const plan = data.plan;
      const lines = [
        `Client brief → Travel Graph`,
        ``,
        plan?.summary ?? "Proposal drafted.",
        `Destination: ${plan?.destination ?? "TBD"} · ${plan?.days ?? "?"} days · budget $${plan?.budgetUsd ?? "—"}`,
        ``,
        "Itinerary nodes:",
        ...(plan?.items ?? []).slice(0, 12).map(
          (it: any) => `• Day ${it.dayOffset + 1} — ${it.kind}: ${it.title}${it.location ? ` (${it.location})` : ""}`,
        ),
        ``,
        "WAYPORT Orchestrator also ran Flight / Hotel / Local specialists against this brief.",
      ];
      setProposal(lines.join("\n"));
      setTripId(data.tripId ?? null);
    } catch (e) {
      setProposal(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wp-card space-y-4 rounded-2xl p-6">
      <div className="wp-eyebrow">WAYPORT PRO — Travel Advisor</div>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={4}
        className="w-full rounded-xl border border-white/15 bg-black/20 p-4 outline-none focus:border-ember"
      />
      <button onClick={generate} disabled={loading} className="wp-cta px-6 py-3">
        {loading ? "Orchestrating…" : "Generate client proposal"}
      </button>
      {proposal && (
        <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm text-text-secondary">{proposal}</pre>
      )}
      {tripId && (
        <a href={`/app/trips/${tripId}`} className="wp-cta inline-flex px-5 py-2.5 text-sm">
          See trip on graph
        </a>
      )}
    </div>
  );
}
