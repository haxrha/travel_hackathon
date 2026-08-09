"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { buildDecisionGraph, type CategoryType, type GraphCandidate } from "@/lib/graph/decision-space";
import type { FilterId, GraphMode } from "./DecisionGraphCanvas";
import { cn } from "@/lib/utils";

const DecisionGraphCanvas = dynamic(() => import("./DecisionGraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
      Assembling decision space…
    </div>
  ),
});

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "selected", label: "Selected only" },
  { id: "hotel", label: "Hotels" },
  { id: "flight", label: "Flights" },
  { id: "restaurant", label: "Restaurants" },
  { id: "attraction", label: "Attractions" },
  { id: "place", label: "Places" },
  { id: "activity", label: "Activities" },
  { id: "event", label: "Events" },
  { id: "transportation", label: "Transport" },
];

type TripLike = {
  id: string;
  title: string;
  destination: string;
  items: {
    id: string;
    kind: string;
    title: string;
    location?: string | null;
    payload?: { priceUsd?: number; description?: string } | null;
  }[];
};

export default function DecisionGraph({ trip }: { trip: TripLike }) {
  const data = useMemo(() => buildDecisionGraph(trip, { candidatesPerSub: 8 }), [trip]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [mode, setMode] = useState<GraphMode>("graph");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphCandidate | null>(null);

  const stats = useMemo(() => {
    const considered = data.candidates.length;
    const chosen = data.selectedIds.length;
    return { considered, chosen, cats: data.categories.length };
  }, [data]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#070504]" style={{ height: "min(78vh, 820px)" }}>
      <DecisionGraphCanvas
        data={data}
        filter={filter}
        mode={mode}
        focusId={focusId}
        onFocus={setFocusId}
        onSelectCandidate={setSelected}
        selectedCandidate={selected}
      />

      {/* Top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto max-w-md rounded-2xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-md">
          <div className="wp-eyebrow">3D decision space</div>
          <p className="mt-1 text-sm text-text-secondary">
            {stats.considered.toLocaleString()} options considered · {stats.cats} galaxies ·{" "}
            <span className="text-ember">{stats.chosen} selected</span>
          </p>
          <p className="mt-1 text-[11px] text-text-tertiary">
            Search space → categories → agent selections for {trip.destination}
          </p>
        </div>

        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={() => setMode("graph")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs",
              mode === "graph" ? "bg-ember text-[#1a100c]" : "border border-white/15 bg-black/50 text-text-secondary",
            )}
          >
            Graph
          </button>
          <button
            type="button"
            onClick={() => setMode("activity")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs",
              mode === "activity" ? "bg-ember text-[#1a100c]" : "border border-white/15 bg-black/50 text-text-secondary",
            )}
          >
            Agent activity
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4">
        <div className="pointer-events-auto mx-auto flex max-w-4xl flex-wrap justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/55 p-2 backdrop-blur-md">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
                setFocusId(null);
              }}
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider",
                filter === f.id ? "bg-ember text-[#1a100c]" : "text-text-secondary hover:text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {mode === "activity" && (
          <p className="mt-2 text-center font-mono text-[10px] text-ember/80">
            Searching · comparing price · location · reviews · prefs · selecting…
          </p>
        )}
      </div>
    </div>
  );
}

export type { CategoryType };
