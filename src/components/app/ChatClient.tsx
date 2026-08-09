"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, formatCurrency } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import AgentTracePanel from "@/components/app/AgentTracePanel";
import RiskAwarePanel from "@/components/app/RiskAwarePanel";
import DecisionTracePanel from "@/components/app/DecisionTracePanel";
import type { RiskDecision } from "@/lib/decision/risk";
import type { DecisionTrace } from "@/lib/decision/transparency";

type Msg = { role: "user" | "wayport"; text: string; tripId?: string };
type Option = {
  id: string;
  label: string;
  destination: string;
  days: number;
  cashUsd: number;
  roveMiles: number;
  effectiveUsd: number;
  why: string;
  score: number;
};

const SUGGESTIONS = [
  "Plan a 5-day Kyoto trip under $3000 with great food",
  "Find me a walkable hotel in Lisbon for next month",
  "I want Portugal for a week — slow travel, local restaurants",
  "Weekend in NYC, nightlife + museums, $1500",
];

export default function ChatClient() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "wayport",
      text: "Where are we going? Tell me the vibe, dates, and budget — I handle the rest.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [rovePick, setRovePick] = useState<Option | null>(null);
  const [readyTripId, setReadyTripId] = useState<string | null>(null);
  const [grandTotal, setGrandTotal] = useState<number | null>(null);
  const [risk, setRisk] = useState<RiskDecision | null>(null);
  const [hotelDecision, setHotelDecision] = useState<DecisionTrace | null>(null);
  const [localDecision, setLocalDecision] = useState<DecisionTrace | null>(null);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setReadyTripId(null);
    setOptions([]);
    setRovePick(null);
    setGrandTotal(null);
    setRisk(null);
    setHotelDecision(null);
    setLocalDecision(null);
    setMsgs((m) => [...m, { role: "user", text }]);
    setLoading(true);
    setStage(["Parsing intent…", "Scoring trip shapes with Rove…"]);

    const tick = window.setTimeout(() => setStage((s) => [...s, "Planner drafting itinerary…"]), 400);
    const tick2 = window.setTimeout(() => setStage((s) => [...s, "Flights · Hotels · Local agents…"]), 900);

    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, createTrip: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const plan = data.plan;
      const opts: Option[] = data.options ?? plan?.options ?? [];
      const pick: Option | null = data.rovePick ?? plan?.rovePick ?? opts[0] ?? null;
      setOptions(opts);
      setRovePick(pick);
      setGrandTotal(data.grandTotalUsd ?? plan?.grandTotalUsd ?? null);
      setRisk(data.risk ?? plan?.risk ?? null);
      setHotelDecision(data.hotelDecision ?? null);
      setLocalDecision(data.localDecision ?? null);
      setStage((s) => [...s, `Rove picked “${pick?.label ?? "balanced"}”`, "Writing nodes to Travel Graph ✓"]);

      const riskNote = data.risk?.options?.find((o: any) => o.chosen);
      const summary =
        plan?.summary ??
        `I've sketched a ${plan?.days ?? ""}-day trip to ${plan?.destination ?? "your destination"}.`;
      const itemCount = plan?.items?.length ?? 0;
      const detail = `${summary}${itemCount ? ` · ${itemCount} priced stops on the graph.` : ""}${
        riskNote
          ? ` · Risk engine chose ${riskNote.label} (${riskNote.successProbability}% success) over the earlier slot.`
          : ""
      }`;
      setMsgs((m) => [...m, { role: "wayport", text: detail, tripId: data.tripId }]);
      if (data.tripId) setReadyTripId(data.tripId);
    } catch {
      setMsgs((m) => [...m, { role: "wayport", text: "Something went wrong — try again." }]);
    } finally {
      window.clearTimeout(tick);
      window.clearTimeout(tick2);
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-1">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
              m.role === "user" ? "ml-auto bg-white text-[#1a100c]" : "border border-white/10 bg-white/5 text-white",
            )}
          >
            {m.text}
          </div>
        ))}

        {(loading || stage.length > 0) && (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="wp-eyebrow">Orchestrator</div>
            <ul className="mt-2 space-y-1 font-mono text-xs text-text-secondary">
              {stage.map((s, i) => (
                <li key={i}>
                  {loading && i === stage.length - 1 ? "● " : "✓ "}
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {options.length > 0 && (
          <div className="space-y-3">
            <div className="wp-eyebrow">Rove · trip shapes considered</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {options.map((o) => {
                const winner = rovePick?.id === o.id;
                return (
                  <div
                    key={o.id}
                    className={cn(
                      "rounded-2xl border p-4 text-sm",
                      winner ? "border-ember/50 bg-ember/10" : "border-white/10 bg-white/5",
                    )}
                  >
                    {winner && <div className="mb-2 text-[10px] uppercase tracking-widest text-ember">Selected</div>}
                    <div className="font-medium">{o.label}</div>
                    <div className="mt-2 text-xs text-text-tertiary">{o.why}</div>
                    <div className="mt-3 space-y-1 text-xs">
                      <div>Cash · {formatCurrency(o.cashUsd)}</div>
                      <div className="text-ember">{o.roveMiles.toLocaleString()} Rove mi</div>
                      <div>Effective · {formatCurrency(o.effectiveUsd)}</div>
                      <div className="text-text-tertiary">Score {o.score}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {readyTripId && !loading && (
          <div className="rounded-2xl border border-ember/40 bg-ember/10 p-4">
            <p className="text-sm text-text-secondary">
              Travel Graph ready
              {grandTotal != null ? ` · grand total ${formatCurrency(grandTotal)}` : ""}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/app/trips/${readyTripId}`} className="wp-cta inline-flex items-center gap-2 px-5 py-2.5 text-sm">
                See your trip now
                <ArrowRight size={16} />
              </Link>
              <Link href="/app" className="wp-cta-ghost inline-flex px-5 py-2.5 text-sm">
                Open map OS
              </Link>
            </div>
          </div>
        )}

        {risk && <RiskAwarePanel risk={risk} />}
        {(hotelDecision || localDecision) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {hotelDecision && <DecisionTracePanel decision={hotelDecision} />}
            {localDecision && <DecisionTracePanel decision={localDecision} />}
          </div>
        )}

        <AgentTracePanel tripId={readyTripId} compact className="mt-2" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={loading}
            onClick={() => send(q)}
            className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5 text-left text-[11px] text-text-secondary transition hover:border-ember/40 hover:text-white disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="I want to go to Japan for 10 days…"
          className="flex-1 rounded-full border border-white/15 bg-black/25 px-5 py-3.5 text-sm outline-none placeholder:text-text-tertiary focus:border-ember"
        />
        <button onClick={() => send()} disabled={loading} className="wp-cta px-6">
          Send
        </button>
      </div>
    </div>
  );
}
