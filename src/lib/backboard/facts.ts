import type { TravelerFact } from "./types";

function slug(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function fact(partial: Omit<TravelerFact, "id" | "source" | "createdAt"> & { id?: string }): TravelerFact {
  const content = partial.content.trim();
  return {
    ...partial,
    content,
    id: partial.id ?? slug(content),
    source: "local",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Pull durable traveler preferences out of a planning message.
 * Deterministic so the planner can apply them on this turn, before Backboard
 * finishes its async Auto extraction.
 */
export function extractTravelerFacts(text: string): TravelerFact[] {
  const found: TravelerFact[] = [];
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return found;

  if (/\baisle\b/i.test(raw)) {
    found.push(fact({ content: "Prefers aisle seats.", kind: "seat", seat: "aisle" }));
  }
  if (/\bwindow seat/i.test(raw)) {
    found.push(fact({ content: "Prefers window seats.", kind: "seat", seat: "window" }));
  }

  const diets: Array<[RegExp, string]> = [
    [/\bvegan\b/i, "vegan"],
    [/\bvegetarian\b/i, "vegetarian"],
    [/\bgluten[-\s]?free\b/i, "gluten-free"],
    [/\bkosher\b/i, "kosher"],
    [/\bhalal\b/i, "halal"],
  ];
  for (const [pattern, diet] of diets) {
    if (pattern.test(raw)) {
      const label = diet[0]!.toUpperCase() + diet.slice(1);
      found.push(fact({ content: `${label}.`, kind: "diet", diet }));
    }
  }

  const allergy = raw.match(/\ballerg(?:y|ic)\s+to\s+([a-z][a-z\s-]{1,40})/i);
  if (allergy?.[1]) {
    const allergen = allergy[1].trim().replace(/[.,].*$/, "");
    if (allergen) {
      found.push(
        fact({
          content: `Allergic to ${allergen}.`,
          kind: "diet",
          diet: `allergic to ${allergen}`,
        }),
      );
    }
  }

  if (
    /\b(?:avoid(?:s|ing)?|no|without|never|don'?t|do not|hate)\b[^.]{0,48}\bred-?\s?eyes?\b/i.test(raw) ||
    /\bred-?\s?eyes?\b[^.]{0,48}\b(?:avoid|no|never|hate)\b/i.test(raw) ||
    /\bno red-?\s?eyes?\b/i.test(raw)
  ) {
    found.push(fact({ content: "Avoids red-eye flights.", kind: "schedule", avoidsRedEye: true }));
  }

  if (/\b(?:prefer(?:s)?|only)\b[^.]{0,40}\bmorning flights?\b/i.test(raw)) {
    found.push(fact({ content: "Prefers morning flights.", kind: "schedule" }));
  }

  const nightly = matchNightlyCeiling(raw);
  if (nightly) {
    found.push(
      fact({
        content: `Hard hotel budget ceiling $${nightly}/night.`,
        kind: "budget",
        nightlyUsd: nightly,
      }),
    );
  }

  if (/\bwheelchair\b/i.test(raw) || /\baccessible room\b/i.test(raw)) {
    found.push(fact({ content: "Needs wheelchair-accessible rooms.", kind: "access" }));
  }

  return dedupeFacts(found);
}

function matchNightlyCeiling(text: string): number | null {
  const patterns = [
    /(?:hard\s+)?(?:budget|hotel)\s+ceiling\s*(?:of|~|≈|around|about)?\s*\$?\s*(\d{2,5})\s*(?:\/|per|a)\s*nights?/i,
    /(?:under|below|max(?:imum)?|cap(?:ped)?(?:\s+at)?|ceiling(?:\s+of)?)\s*~?\s*\$\s*(\d{2,5})\s*(?:\/|per|a)\s*nights?/i,
    /\$\s*(\d{2,5})\s*(?:\/|per)\s*nights?/i,
    /(?:under|below|max)\s*\$?\s*(\d{2,5})\s*(?:a|per)\s*night/i,
    /(\d{2,5})\s*(?:dollars|usd)\s*(?:a|per|\/)\s*night/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const amount = Number(match[1]);
    if (amount >= 40 && amount <= 5000) return amount;
  }
  return null;
}

export function dedupeFacts(facts: TravelerFact[]): TravelerFact[] {
  const seen = new Set<string>();
  const out: TravelerFact[] = [];
  for (const fact of facts) {
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    out.push(fact);
  }
  return out;
}

export function mergeFacts(existing: TravelerFact[], incoming: TravelerFact[]): TravelerFact[] {
  const byId = new Map<string, TravelerFact>();
  for (const fact of existing) byId.set(fact.id, fact);
  for (const fact of incoming) {
    const prev = byId.get(fact.id);
    if (!prev) {
      byId.set(fact.id, fact);
      continue;
    }
    // Prefer a Backboard-sourced copy once the assistant has stored it.
    if (fact.source === "backboard" && prev.source !== "backboard") {
      byId.set(fact.id, { ...fact, createdAt: prev.createdAt, tripId: fact.tripId ?? prev.tripId });
    }
  }
  return [...byId.values()];
}

/** Re-parse a Backboard memory sentence into structured facts when we can. */
export function factsFromMemoryText(
  content: string,
  source: TravelerFact["source"],
  extra?: Partial<TravelerFact>,
): TravelerFact[] {
  const parsed = extractTravelerFacts(content).map((item) => ({
    ...item,
    source,
    createdAt: extra?.createdAt ?? item.createdAt,
    tripId: extra?.tripId ?? item.tripId,
    backboardMemoryId: extra?.backboardMemoryId,
  }));
  if (parsed.length) return parsed;
  const trimmed = content.trim();
  if (!trimmed) return [];
  return [
    {
      id: slug(trimmed),
      content: trimmed,
      kind: "other",
      source,
      createdAt: extra?.createdAt ?? new Date().toISOString(),
      tripId: extra?.tripId,
      backboardMemoryId: extra?.backboardMemoryId,
    },
  ];
}

export function nightlyCeiling(facts: TravelerFact[]): number | null {
  const amounts = facts.map((f) => f.nightlyUsd).filter((n): n is number => typeof n === "number");
  if (!amounts.length) return null;
  return Math.min(...amounts);
}

export function formatMemoryForPrompt(facts: TravelerFact[]): string {
  if (!facts.length) return "No cross-trip traveler memory yet.";
  return facts.map((f) => `- ${f.content}`).join("\n");
}

type PlanItem = {
  kind: string;
  title: string;
  notes?: string;
  startHour?: number;
  priceUsd?: number;
  description?: string;
  whatToDo?: string[];
};

function joinNotes(current: string | undefined, next: string): string {
  if (!current) return next;
  if (current.includes(next)) return current;
  return `${current} ${next}`;
}

/**
 * Force itinerary items to obey recalled preferences.
 * The model is asked to do this too; this pass is what makes the second trip
 * visibly different even when the skeleton planner runs without an LLM key.
 */
export function applyMemoryToPlanItems<T extends PlanItem>(items: T[], facts: TravelerFact[]): T[] {
  const seat = facts.find((f) => f.seat)?.seat;
  const avoidsRedEye = facts.some((f) => f.avoidsRedEye);
  const diets = [...new Set(facts.map((f) => f.diet).filter((d): d is string => Boolean(d)))];
  const ceiling = nightlyCeiling(facts);

  return items.map((item) => {
    const next = { ...item };
    if (next.kind === "FLIGHT") {
      if (seat) {
        next.notes = joinNotes(next.notes, `Request ${seat} seat — traveler memory.`);
      }
      if (avoidsRedEye) {
        const hour = next.startHour ?? 9;
        const redEye = hour >= 21 || hour < 6 || /red-?\s?eye/i.test(next.title);
        if (redEye) {
          next.startHour = 10;
          next.title = next.title.replace(/red-?\s?eye/gi, "daytime");
          next.notes = joinNotes(next.notes, "Moved off a red-eye — traveler memory.");
        } else {
          next.notes = joinNotes(next.notes, "Daytime only — red-eyes excluded by traveler memory.");
        }
      }
    }
    if (next.kind === "RESTAURANT" && diets.length) {
      for (const diet of diets) {
        if (next.title.toLowerCase().includes(diet.toLowerCase())) continue;
        const label = diet[0]!.toUpperCase() + diet.slice(1);
        next.title = `${label} · ${next.title}`;
      }
      next.notes = joinNotes(next.notes, `${diets.join(", ")} — from traveler memory.`);
    }
    if (next.kind === "HOTEL" && ceiling && (next.priceUsd ?? 0) > ceiling) {
      next.priceUsd = ceiling;
      next.notes = joinNotes(next.notes, `Capped at $${ceiling}/night — traveler memory.`);
    }
    return next;
  });
}
