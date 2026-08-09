"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "personality", title: "Personality", fields: ["adventure", "luxury", "spontaneity", "planning"] },
  { id: "physical", title: "Physical", fields: ["walkingTolerance", "heatTolerance", "jetLagSeverity"] },
  { id: "social", title: "Social", fields: ["nightlife", "crowds", "touristAttractions"] },
  { id: "food", title: "Food", fields: ["spice", "fineDining", "streetFood"] },
  { id: "money", title: "Money", fields: ["budgetSensitivity", "hotelPriority", "experiencePriority"] },
];

/** Heuristic phrase → partial DNA updates (only fields we can infer). */
function inferDnaFromPhrase(phrase: string, current: Record<string, any>) {
  const lower = phrase.toLowerCase();
  const next = structuredClone(current);
  const touched: string[] = [];

  const bump = (section: string, field: string, value: number) => {
    next[section] = { ...(next[section] ?? {}), [field]: Math.max(0, Math.min(10, value)) };
    touched.push(`${section}.${field}`);
  };

  if (/adventur|hike|trek|explore|spontaneous|road trip/.test(lower)) {
    bump("personality", "adventure", 9);
    bump("personality", "spontaneity", 8);
    bump("personality", "planning", 3);
  }
  if (/luxury|5.?star|fine dining|spa|first class|suite/.test(lower)) {
    bump("personality", "luxury", 9);
    bump("food", "fineDining", 9);
    bump("money", "hotelPriority", 8);
    bump("money", "budgetSensitivity", 2);
  }
  if (/budget|cheap|hostel|backpack/.test(lower)) {
    bump("money", "budgetSensitivity", 9);
    bump("personality", "luxury", 2);
    bump("food", "streetFood", 8);
  }
  if (/walk|walkable|on foot|hike/.test(lower)) {
    bump("physical", "walkingTolerance", 9);
  }
  if (/tired|relax|slow|rest|chill/.test(lower)) {
    bump("personality", "spontaneity", 3);
    bump("personality", "planning", 7);
    bump("physical", "walkingTolerance", 3);
    bump("money", "experiencePriority", 4);
  }
  if (/nightlife|club|bar|party|late night/.test(lower)) {
    bump("social", "nightlife", 9);
    bump("social", "crowds", 7);
  }
  if (/quiet|avoid crowds|peaceful|off.?the.?beaten/.test(lower)) {
    bump("social", "crowds", 2);
    bump("social", "touristAttractions", 3);
    bump("social", "nightlife", 2);
  }
  if (/food|eat|restaurant|cuisine|culinary/.test(lower)) {
    bump("food", "streetFood", /street|market|local/.test(lower) ? 9 : 6);
    bump("food", "fineDining", /fine|michelin|kaiseki/.test(lower) ? 9 : 5);
    bump("money", "experiencePriority", 8);
  }
  if (/spicy|spice|chili|hot food/.test(lower)) bump("food", "spice", 9);
  if (/vegetarian|vegan|halal|kosher|allergy/.test(lower)) bump("food", "spice", Number(next.food?.spice ?? 5));
  if (/heat|desert|tropical|humid/.test(lower)) bump("physical", "heatTolerance", 8);
  if (/cold|winter|snow/.test(lower)) bump("physical", "heatTolerance", 3);
  if (/jet.?lag|long.?haul|timezone/.test(lower)) bump("physical", "jetLagSeverity", 8);
  if (/museum|culture|history|architecture/.test(lower)) {
    bump("social", "touristAttractions", 7);
    bump("money", "experiencePriority", 8);
  }
  if (/photo|golden hour|instagram/.test(lower)) bump("personality", "adventure", 7);
  if (/plan|itinerary|schedule|organized/.test(lower)) {
    bump("personality", "planning", 9);
    bump("personality", "spontaneity", 2);
  }
  if (/experience|local|authentic/.test(lower)) bump("money", "experiencePriority", 9);

  return { dna: next, touched };
}

export default function DnaEditor({
  initial,
  travelerId,
  subjectName,
}: {
  initial: Record<string, any>;
  /** When set, saves to that traveler's DNA instead of the signed-in user profile. */
  travelerId?: string;
  subjectName?: string;
}) {
  const [dna, setDna] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [inferNote, setInferNote] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDna(initial);
    setSaved(false);
    setInferNote(null);
    setHighlight(new Set());
  }, [initial, travelerId]);

  function getVal(section: string, field: string) {
    return Number(dna?.[section]?.[field] ?? 5);
  }

  function setVal(section: string, field: string, value: number) {
    setDna((d: any) => ({
      ...d,
      [section]: { ...(d?.[section] ?? {}), [field]: value },
    }));
    setSaved(false);
  }

  function applyPhrase() {
    if (!phrase.trim()) return;
    const { dna: next, touched } = inferDnaFromPhrase(phrase, dna);
    setDna(next);
    setHighlight(new Set(touched));
    setSaved(false);
    setInferNote(
      touched.length
        ? `Updated ${touched.length} slider${touched.length === 1 ? "" : "s"} from your phrase. Tweak anything that still feels off.`
        : "Couldn't map that phrase to sliders — try mentioning food, luxury, walking, nightlife, or budget.",
    );
  }

  async function save() {
    setSaving(true);
    const url = travelerId
      ? `/api/travelers/${encodeURIComponent(travelerId)}/dna`
      : "/api/profile";
    const body = travelerId ? { dna } : { dna };
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setSaved(true);
  }

  const whose = subjectName ? `${subjectName}'s` : "your";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-xl text-text-secondary">
          WAYPORT uses {whose} Travel DNA to tailor Orchestrator decisions for this person.
        </p>
        <button onClick={save} disabled={saving} className="wp-cta px-5 py-2.5 text-sm">
          {saving ? "Saving…" : saved ? "Saved" : "Save DNA"}
        </button>
      </div>

      <section className="wp-card rounded-2xl p-6">
        <div className="wp-eyebrow">Describe {subjectName ? subjectName.split(" ")[0] : "yourself"}</div>
        <p className="mt-2 text-sm text-text-secondary">
          Paste a vibe in plain English — we only move the sliders we can infer.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyPhrase()}
            placeholder='e.g. "I love spicy street food, walkable cities, and hate tourist crowds"'
            className="flex-1 rounded-full border border-white/15 bg-black/25 px-5 py-3 text-sm outline-none placeholder:text-text-tertiary focus:border-ember"
          />
          <button type="button" onClick={applyPhrase} className="wp-cta shrink-0 px-5 py-3 text-sm">
            Infer sliders
          </button>
        </div>
        {inferNote && <p className="mt-3 text-xs text-ember">{inferNote}</p>}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {SECTIONS.map((sec) => (
          <section key={sec.id} className="wp-card rounded-2xl p-6">
            <h3 className="wp-eyebrow mb-4">{sec.title}</h3>
            <div className="space-y-5">
              {sec.fields.map((f) => {
                const key = `${sec.id}.${f}`;
                const val = getVal(sec.id, f);
                const lit = highlight.has(key);
                return (
                  <div key={f}>
                    <div className="flex items-center justify-between text-sm">
                      <label className={cn("capitalize", lit ? "text-ember" : "text-text-secondary")}>
                        {f.replace(/([A-Z])/g, " $1")}
                      </label>
                      <span className="font-mono text-xs text-ember">{val}/10</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={val}
                      onChange={(e) => setVal(sec.id, f, parseInt(e.target.value, 10))}
                      className="wp-range mt-2 w-full"
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
