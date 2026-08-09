import type { TripDay, SymbolicTripState, SymbolicItem } from "./engine";

/**
 * Solver — converts symbolic constraints into candidate itineraries.
 * Deterministic local search over a small candidate space. In production this
 * becomes OR-Tools CP-SAT; here we use a structured relaxation pass.
 */

export interface SolveInput {
  state: SymbolicTripState;
  weights?: Record<string, number>;
  maxCandidates?: number;
}

export interface SolveResult {
  best: SymbolicTripState;
  candidates: SymbolicTripState[];
  objective: number;
}

export function solve(input: SolveInput): SolveResult {
  const { state, weights = {}, maxCandidates = 4 } = input;
  const candidates: SymbolicTripState[] = [];

  // Generate variants: shift non-fixed items to satisfy constraints
  for (let shift = 0; shift < maxCandidates; shift++) {
    const variant = shiftDays(state, shift);
    if (assertHardConstraintsOK(variant)) {
      candidates.push(variant);
    }
  }

  const best =
    candidates.sort((a, b) => objective(b, weights) - objective(a, weights))[0] ?? state;

  return { best, candidates, objective: objective(best, weights) };
}

export function objective(state: SymbolicTripState, weights: Record<string, number>): number {
  let total = 0;
  const dCount = Math.max(1, state.days.length);
  for (const day of state.days) {
    total += day.items.length * (weights.activityDensity ?? 1);
    total -= day.items.filter((i) => i.requiresRest).length * (weights.restPenalty ?? 0.5);
  }
  total -= Math.abs(state.spentUsd - state.budgetUsd * 0.85) / 1000;
  total -= state.days.length === dCount ? 0 : dCount - state.days.length;
  return total;
}

function shiftDays(state: SymbolicTripState, shift: number): SymbolicTripState {
  const s = structuredClone(state);
  for (const day of s.days) {
    for (const item of day.items) {
      if (!item.fixedTime) {
        item.startMinutes = Math.min(item.startMinutes + shift * 15, 22 * 60);
        item.endMinutes = Math.min(item.endMinutes + shift * 15, 23 * 60);
      }
    }
  }
  return s;
}

export function assertHardConstraintsOK(state: SymbolicTripState): boolean {
  // Reuse engine's assert; inline here to avoid circular import into Engine exports
  for (const day of state.days) {
    const sorted = [...day.items].sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinutes < sorted[i - 1].endMinutes) return false;
    }
  }
  if (state.spentUsd > state.budgetUsd) return false;
  if (state.sleepMinutesPerNight.some((m) => m < state.minSleepMinutes)) return false;
  return true;
}
