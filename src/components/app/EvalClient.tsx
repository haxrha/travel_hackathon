"use client";

import { useState } from "react";
import AgentTracePanel from "@/components/app/AgentTracePanel";

export default function EvalClient({ tripId }: { tripId?: string }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, take: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eval failed");
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={busy} className="wp-cta px-5 py-2 text-sm disabled:opacity-50">
          {busy ? "Running 10 scenarios…" : "Run disruption eval"}
        </button>
        {!tripId && <span className="text-sm text-text-tertiary">Uses latest trip on graph if available.</span>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {report && (
        <div className="space-y-4">
          <div className="wp-card rounded-2xl p-6">
            <div className="wp-eyebrow">Overall constraint satisfaction</div>
            <div className="mt-2 font-display text-5xl text-ember">{report.overallPct}%</div>
            <p className="mt-2 text-sm text-text-secondary">
              {report.scenariosRun} scenarios · {report.destination}
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-widest text-text-tertiary">
                <tr>
                  <th className="px-4 py-3">Scenario</th>
                  <th className="px-4 py-3">Affected</th>
                  <th className="px-4 py-3">Repaired</th>
                  <th className="px-4 py-3">Satisfied</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r: any) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="px-4 py-3">{r.label}</td>
                    <td className="px-4 py-3 text-text-secondary">{r.affected}</td>
                    <td className="px-4 py-3 text-text-secondary">{r.repaired}</td>
                    <td className={`px-4 py-3 ${r.ok ? "text-ok" : "text-ember"}`}>{r.constraintsSatisfiedPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AgentTracePanel tripId={tripId} />
    </div>
  );
}
