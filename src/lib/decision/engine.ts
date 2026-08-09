/**
 * WAYPORT Decision Engine — deterministic trip reasoning.
 *
 * LLM extracts intent and constraints; this engine computes symbolic state,
 * asserts hard constraints, and produces a scored itinerary. The LLM explains
 * the engine's output — never decides budget or timing itself.
 */

export interface HardConstraint {
  id: string;
  description: string;
  kind: "budget" | "time" | "walking" | "sleep" | "overlap" | "transit" | "accessibility" | "custom";
  check: (state: SymbolicTripState) => ConstraintResult;
}

export interface ConstraintResult {
  ok: boolean;
  violation?: string;
  cost?: number;
}

export interface SymbolicTripState {
  tripId: string;
  travelers: number;
  budgetUsd: number;
  spentUsd: number;
  days: TripDay[];
  totalWalkingMetersPerDay: number[];
  maxWalkingMetersPerDay: number[];
  sleepMinutesPerNight: number[];
  minSleepMinutes: number;
}

export interface TripDay {
  date: string;
  items: SymbolicItem[];
}

export interface SymbolicItem {
  id: string;
  kind: string;
  startMinutes: number; // minutes since midnight
  endMinutes: number;
  costUsd?: number;
  walkingMetersFromPrev?: number;
  fixedTime?: boolean; // concerts, reservations
  requiresRest?: boolean;
}

export interface TripScore {
  personalPreference: number; // 0-1
  experienceQuality: number;
  convenience: number;
  value: number;
  foodMatch: number;
  uniqueness: number;
  weatherFit: number;
  sustainability: number;
  rewards: number;
  carbon: number;
  accessibility: number;
  energy: number;
  crowds: number;
  total: number; // weighted sum
}

export const DEFAULT_SCORE_WEIGHTS: Record<keyof Omit<TripScore, "total">, number> = {
  personalPreference: 0.25,
  experienceQuality: 0.2,
  convenience: 0.15,
  value: 0.1,
  foodMatch: 0.1,
  uniqueness: 0.05,
  weatherFit: 0.05,
  sustainability: 0.05,
  rewards: 0.05,
  carbon: 0.04,
  accessibility: 0.03,
  energy: 0.02,
  crowds: 0.01,
};

const HARD_CONSTRAINTS: HardConstraint[] = [
  budgetConstraint(),
  noOverlapConstraint(),
  walkingConstraint(),
  sleepConstraint(),
  firstActivityGapConstraint(120), // 2h after flight arrival
];

export function budgetConstraint(): HardConstraint {
  return {
    id: "budget",
    description: "Budget must not exceed trip limit",
    kind: "budget",
    check: (s) =>
      s.spentUsd <= s.budgetUsd
        ? { ok: true }
        : { ok: false, violation: `Spent $${s.spentUsd} exceeds budget $${s.budgetUsd}`, cost: s.spentUsd - s.budgetUsd },
  };
}

export function noOverlapConstraint(): HardConstraint {
  return {
    id: "no-overlap",
    description: "No overlapping items",
    kind: "overlap",
    check: (s) => {
      for (const day of s.days) {
        const sorted = [...day.items].sort((a, b) => a.startMinutes - b.startMinutes);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].startMinutes < sorted[i - 1].endMinutes) {
            return {
              ok: false,
              violation: `Overlap on ${day.date}: ${sorted[i - 1].kind} ends after ${sorted[i].kind} starts`,
            };
          }
        }
      }
      return { ok: true };
    },
  };
}

export function walkingConstraint(): HardConstraint {
  return {
    id: "walking",
    description: "Walking within tolerance",
    kind: "walking",
    check: (s) => {
      for (let i = 0; i < s.days.length; i++) {
        const max = s.maxWalkingMetersPerDay[i] ?? 15000;
        if (s.totalWalkingMetersPerDay[i] > max) {
          return { ok: false, violation: `Walking ${s.totalWalkingMetersPerDay[i]}m exceeds ${max}m on day ${i + 1}` };
        }
      }
      return { ok: true };
    },
  };
}

export function sleepConstraint(): HardConstraint {
  return {
    id: "sleep",
    description: "Sleep >= minimum per night",
    kind: "sleep",
    check: (s) => {
      for (let i = 0; i < s.sleepMinutesPerNight.length; i++) {
        if (s.sleepMinutesPerNight[i] < s.minSleepMinutes) {
          return {
            ok: false,
            violation: `Night ${i + 1} has ${Math.round(s.sleepMinutesPerNight[i] / 60)}h sleep, below ${Math.round(s.minSleepMinutes / 60)}h`,
          };
        }
      }
      return { ok: true };
    },
  };
}

export function firstActivityGapConstraint(minGapMinutes: number): HardConstraint {
  return {
    id: "arrival-gap",
    description: `First activity >= ${minGapMinutes}m after arrival`,
    kind: "time",
    check: (s) => {
      for (const day of s.days) {
        const flight = day.items.find((i) => i.kind === "flight" && i.startMinutes === Math.min(...day.items.map((x) => x.startMinutes)));
        if (!flight) continue;
        const next = day.items.filter((i) => i.kind !== "flight" && i.startMinutes >= flight.endMinutes).sort((a, b) => a.startMinutes - b.startMinutes)[0];
        if (next && next.startMinutes - flight.endMinutes < minGapMinutes) {
          return {
            ok: false,
            violation: `First activity ${next.kind} starts ${next.startMinutes - flight.endMinutes}m after flight arrival (<${minGapMinutes}m)`,
          };
        }
      }
      return { ok: true };
    },
  };
}

export function assertHardConstraints(state: SymbolicTripState): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const c of HARD_CONSTRAINTS) {
    const r = c.check(state);
    if (!r.ok && r.violation) violations.push(`${c.id}: ${r.violation}`);
  }
  return { ok: violations.length === 0, violations };
}

export function scoreItinerary(partial: Partial<TripScore>, weights = DEFAULT_SCORE_WEIGHTS): TripScore {
  const s: TripScore = {
    personalPreference: 0.5,
    experienceQuality: 0.5,
    convenience: 0.5,
    value: 0.5,
    foodMatch: 0.5,
    uniqueness: 0.5,
    weatherFit: 0.5,
    sustainability: 0.5,
    rewards: 0.5,
    carbon: 0.5,
    accessibility: 0.5,
    energy: 0.5,
    crowds: 0.5,
    ...partial,
    total: 0,
  };
  let total = 0;
  for (const k of Object.keys(weights) as (keyof typeof weights)[]) {
    total += s[k] * weights[k];
  }
  s.total = Math.round(total * 100) / 100;
  return s;
}

export type OptimizeFor =
  | "cheapest"
  | "fastest"
  | "greenest"
  | "experience"
  | "relaxed"
  | "balanced"
  | "local";

export function weightsFor(mode: OptimizeFor): typeof DEFAULT_SCORE_WEIGHTS {
  const w = { ...DEFAULT_SCORE_WEIGHTS };
  if (mode === "cheapest") {
    w.value = 0.35;
    w.rewards = 0.12;
  }
  if (mode === "fastest") w.convenience = 0.35;
  if (mode === "greenest") {
    w.carbon = 0.28;
    w.sustainability = 0.2;
  }
  if (mode === "experience") {
    w.experienceQuality = 0.32;
    w.uniqueness = 0.12;
  }
  if (mode === "relaxed") {
    w.energy = 0.25;
    w.crowds = 0.15;
    w.convenience = 0.2;
  }
  if (mode === "local") {
    w.uniqueness = 0.2;
    w.foodMatch = 0.18;
    w.personalPreference = 0.22;
  }
  return w;
}

/** Soft preferences — never block, only score. */
export interface SoftPreference {
  id: string;
  weight: number; // 0-1 importance
  label: string;
}

export function evaluateSoftConstraints(
  state: SymbolicTripState,
  prefs: SoftPreference[],
): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 1;
  const foodish = state.days.flatMap((d) => d.items).filter((i) => i.kind === "restaurant" || i.kind === "RESTAURANT").length;
  const activities = state.days.flatMap((d) => d.items).filter((i) => /activity|experience|landmark/i.test(i.kind)).length;
  const avgWalk =
    state.totalWalkingMetersPerDay.length === 0
      ? 0
      : state.totalWalkingMetersPerDay.reduce((a, b) => a + b, 0) / state.totalWalkingMetersPerDay.length;

  for (const p of prefs) {
    if (p.id === "min_walk" && avgWalk > 8000) {
      score -= 0.12 * p.weight;
      notes.push(`${p.label}: avg walk ${Math.round(avgWalk)}m`);
    }
    if (p.id === "local_food" && foodish > 0) {
      score += 0.05 * p.weight;
      notes.push(`${p.label}: ${foodish} food stops`);
    }
    if (p.id === "localness" && activities > 0) {
      score += 0.04 * p.weight;
      notes.push(`${p.label}: ${activities} experiences`);
    }
    if (p.id === "value" && state.spentUsd > state.budgetUsd * 0.9) {
      score -= 0.1 * p.weight;
      notes.push(`${p.label}: spend near budget ceiling`);
    }
    if (p.id === "avoid_crowds" && activities > 4) {
      score -= 0.06 * p.weight;
      notes.push(`${p.label}: dense activity day`);
    }
  }
  return { score: Math.max(0, Math.min(1.2, score)), notes };
}

export interface TripQualityVector {
  experience: number;
  personalization: number;
  value: number;
  convenience: number;
  sustainability: number;
  accessibility: number;
  localness: number;
  energy: number;
  crowds: number;
  total: number;
  optimizeFor: OptimizeFor;
}

/** Build 0-100 quality vector from symbolic state + DNA + soft score. */
export function computeQualityVector(
  state: SymbolicTripState,
  dna: any,
  soft: { score: number },
  optimizeFor: OptimizeFor = "balanced",
): TripQualityVector {
  const budgetRatio = state.budgetUsd > 0 ? Math.min(1, state.spentUsd / state.budgetUsd) : 0.5;
  const value = Math.round((1 - Math.abs(budgetRatio - 0.75)) * 100);
  const walkTol = dna?.physical?.walkingTolerance ?? 5;
  const avgWalk =
    state.totalWalkingMetersPerDay.length === 0
      ? 5000
      : state.totalWalkingMetersPerDay.reduce((a, b) => a + b, 0) / state.totalWalkingMetersPerDay.length;
  const walkFit = Math.max(0, 1 - Math.abs(avgWalk - walkTol * 1500) / 12000);
  const food = ((dna?.food?.streetFood ?? 5) + (dna?.food?.fineDining ?? 5)) / 20;
  const localness = dna?.style?.localExperiences ? 89 : 62;
  const energy = Math.round((0.4 + walkFit * 0.4 + soft.score * 0.2) * 100);
  const crowds = Math.round((1 - (dna?.social?.crowds ?? 5) / 12) * 100);
  const accessibility = Math.round((0.55 + (10 - (dna?.physical?.walkingTolerance ?? 5)) * 0.03) * 100);
  const sustainability = optimizeFor === "greenest" ? 88 : 74;
  const experience = Math.round((0.7 + soft.score * 0.25) * 100);
  const personalization = Math.round((0.65 + soft.score * 0.3) * 100);
  const convenience = Math.round(walkFit * 100);

  const weights = weightsFor(optimizeFor);
  const tripScore = scoreItinerary(
    {
      personalPreference: personalization / 100,
      experienceQuality: experience / 100,
      convenience: convenience / 100,
      value: value / 100,
      foodMatch: food,
      uniqueness: localness / 100,
      weatherFit: 0.8,
      sustainability: sustainability / 100,
      rewards: 0.7,
      carbon: sustainability / 100,
      accessibility: accessibility / 100,
      energy: energy / 100,
      crowds: crowds / 100,
    },
    weights,
  );

  return {
    experience,
    personalization,
    value,
    convenience,
    sustainability,
    accessibility,
    localness,
    energy,
    crowds,
    total: Math.round(tripScore.total * 100),
    optimizeFor,
  };
}

/** Multi-traveler compromise: maximize min satisfaction + mean. */
export function groupCompromiseScore(
  travelers: { name: string; weights: Record<string, number> }[],
  optionScores: Record<string, number>,
): { score: number; fairness: number; detail: { name: string; satisfaction: number }[] } {
  const detail = travelers.map((t) => {
    let sat = 0;
    let wSum = 0;
    for (const [k, w] of Object.entries(t.weights)) {
      sat += (optionScores[k] ?? 0.5) * w;
      wSum += w;
    }
    return { name: t.name, satisfaction: wSum ? sat / wSum : 0.5 };
  });
  const mean = detail.reduce((s, d) => s + d.satisfaction, 0) / Math.max(1, detail.length);
  const min = Math.min(...detail.map((d) => d.satisfaction));
  return { score: 0.6 * mean + 0.4 * min, fairness: min, detail };
}
