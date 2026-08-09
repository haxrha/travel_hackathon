/**
 * WAYPORT World Model — persistent Traveler + Trip + World state.
 * LLM has conversational context; this is queryable structured state.
 */

import type { TravelerDNA } from "./types";
import { getOrCreateProfile, demoStore, isMemoryGraph } from "../demo/store";
import { TravelGraph } from "./service";
import { assertHardConstraints, scoreItinerary, evaluateSoftConstraints, computeQualityVector, type OptimizeFor, type SoftPreference, type TripQualityVector } from "../decision/engine";
import { valueRewards } from "../tools/rewards/valuation";
import { fetchWeather, shouldReplanForWeather } from "../tools/weather/openweather";

export interface TravelerState {
  userId: string;
  name: string;
  email: string;
  homeAirport: string;
  dna: TravelerDNA | Record<string, unknown>;
  preferences: string[];
  autonomy: Record<string, unknown>;
  dietary: string[];
  loyalty: { program: string; valueHint: string }[];
  pastTrips: { id: string; destination: string; title: string }[];
  feedback: { note: string; weight: number }[];
}

export interface TripNode {
  id: string;
  kind: string;
  title: string;
  status: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  priceUsd?: number;
  confirmationCode?: string;
  lat?: number;
  lng?: number;
  description?: string;
  whatToDo?: string[];
}

export interface TripRelation {
  fromId: string;
  toId: string;
  mode: string;
  minutes?: number;
  costUsd?: number;
  distanceMeters?: number;
  dependency: string;
  confidence: number;
}

export interface WorldSignals {
  weather: { condition: string; tempC: number; rainChance: number };
  flightStatus: { delayed: boolean; delayMinutes: number };
  hotelAvailability: "open" | "tight" | "sold_out";
  traffic: "light" | "moderate" | "heavy";
  localEvents: string[];
  disruptions: string[];
  asOf: string;
}

export interface WayportWorldModel {
  traveler: TravelerState;
  trip: {
    id: string;
    title: string;
    destination: string;
    status: string;
    mode: string;
    budgetUsd: number;
    spentUsd: number;
    remainingUsd: number;
    nodes: TripNode[];
    relations: TripRelation[];
  } | null;
  world: WorldSignals;
  quality: TripQualityVector | null;
  soft: { score: number; notes: string[] };
  hardViolations: string[];
  optimizeFor: OptimizeFor;
}

const worldByTrip = new Map<string, WorldSignals>();

export function getWorldSignals(tripId: string): WorldSignals {
  if (!worldByTrip.has(tripId)) {
    worldByTrip.set(tripId, {
      weather: { condition: "clear", tempC: 22, rainChance: 10 },
      flightStatus: { delayed: false, delayMinutes: 0 },
      hotelAvailability: "open",
      traffic: "moderate",
      localEvents: ["Neighborhood market this evening"],
      disruptions: [],
      asOf: new Date().toISOString(),
    });
  }
  return worldByTrip.get(tripId)!;
}

export function mutateWorld(tripId: string, patch: Partial<WorldSignals> & { inject?: string }) {
  const cur = getWorldSignals(tripId);
  const next: WorldSignals = {
    ...cur,
    ...patch,
    weather: { ...cur.weather, ...(patch.weather ?? {}) },
    flightStatus: { ...cur.flightStatus, ...(patch.flightStatus ?? {}) },
    asOf: new Date().toISOString(),
  };
  if (patch.inject) {
    next.disruptions = [...cur.disruptions, patch.inject];
  }
  worldByTrip.set(tripId, next);
  return next;
}

export async function buildWorldModel(
  userId: string,
  tripId?: string,
  optimizeFor: OptimizeFor = "balanced",
): Promise<WayportWorldModel> {
  const profile = getOrCreateProfile(userId);
  const trips = isMemoryGraph()
    ? demoStore.listTrips(userId)
    : await new TravelGraph(userId).listTrips();

  const traveler: TravelerState = {
    userId,
    name: profile.name,
    email: profile.email,
    homeAirport: profile.homeAirport,
    dna: profile.dna as unknown as TravelerDNA,
    preferences: profile.preferences,
    autonomy: profile.autonomy,
    dietary: (profile.dna as any)?.food?.dietary ?? [],
    loyalty: [
      { program: "Rove", valueHint: "12 mi / $" },
      { program: "Airline partners", valueHint: "status + miles" },
    ],
    pastTrips: trips.slice(0, 5).map((t: any) => ({
      id: t.id,
      destination: t.destination,
      title: t.title,
    })),
    feedback: [
      { note: "Prefers walkable stays over resort isolation", weight: 0.8 },
      { note: "Rejects tourist-trap restaurants when locality score is low", weight: 0.7 },
    ],
  };

  if (!tripId) {
    return {
      traveler,
      trip: null,
      world: getWorldSignals("none"),
      quality: null,
      soft: { score: 1, notes: [] },
      hardViolations: [],
      optimizeFor,
    };
  }

  const graph = new TravelGraph(userId);
  const trip = await graph.getTrip({ tripId });
  if (!trip) {
    return {
      traveler,
      trip: null,
      world: getWorldSignals(tripId),
      quality: null,
      soft: { score: 1, notes: [] },
      hardViolations: ["trip_not_found"],
      optimizeFor,
    };
  }

  const nodes: TripNode[] = trip.items.map((it: any) => {
    const p = (it.payload ?? {}) as Record<string, unknown>;
    return {
      id: it.id,
      kind: it.kind,
      title: it.title,
      status: it.status,
      startTime: it.startTime?.toISOString?.() ?? it.startTime,
      endTime: it.endTime?.toISOString?.() ?? it.endTime,
      location: it.location,
      priceUsd: typeof p.priceUsd === "number" ? p.priceUsd : undefined,
      confirmationCode: it.confirmationCode ?? (typeof p.confirmationCode === "string" ? p.confirmationCode : undefined),
      lat: typeof p.lat === "number" ? p.lat : it.lat,
      lng: typeof p.lng === "number" ? p.lng : it.lng,
      description: typeof p.description === "string" ? p.description : undefined,
      whatToDo: Array.isArray(p.whatToDo) ? (p.whatToDo as string[]) : undefined,
    };
  });

  // Implicit chain relations when edges empty
  const relations: TripRelation[] = [];
  const ordered = [...nodes].sort(
    (a, b) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime(),
  );
  for (let i = 0; i < ordered.length - 1; i++) {
    relations.push({
      fromId: ordered[i].id,
      toId: ordered[i + 1].id,
      mode: ordered[i].kind === "FLIGHT" ? "TRANSFER" : "WALKING",
      minutes: 15 + (i % 3) * 7,
      costUsd: ordered[i].kind === "FLIGHT" ? 45 : 0,
      distanceMeters: 400 + i * 200,
      dependency: "sequential",
      confidence: 0.86,
    });
  }

  const budget = (trip as any).budgets?.[0];
  const spent =
    Number(budget?.actual ?? 0) ||
    nodes.reduce((s, n) => s + (n.priceUsd ?? 0), 0);
  const budgetUsd = Number(budget?.totalBudget ?? 3000);

  const normalized = graph.toSymbolic(trip as any, profile.dna as any);
  const softPrefs = dnaToSoftPrefs(profile.dna as any);
  const soft = evaluateSoftConstraints(normalized.symbolic, softPrefs);
  const quality = computeQualityVector(normalized.symbolic, profile.dna as any, soft, optimizeFor);

  const world = getWorldSignals(tripId);

  return {
    traveler,
    trip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      status: trip.status,
      mode: trip.mode,
      budgetUsd,
      spentUsd: spent,
      remainingUsd: Math.max(0, budgetUsd - spent),
      nodes,
      relations,
    },
    world,
    quality,
    soft,
    hardViolations: normalized.hardViolations,
    optimizeFor,
  };
}

export function dnaToSoftPrefs(dna: any): SoftPreference[] {
  const prefs: SoftPreference[] = [];
  if (dna?.food?.streetFood >= 7) prefs.push({ id: "local_food", weight: 0.8, label: "Prefer local / street food" });
  if (dna?.food?.fineDining >= 7) prefs.push({ id: "fine_dining", weight: 0.7, label: "Prefer fine dining" });
  if (dna?.physical?.walkingTolerance <= 4) prefs.push({ id: "min_walk", weight: 0.9, label: "Minimize walking" });
  if (dna?.physical?.walkingTolerance >= 8) prefs.push({ id: "walkable", weight: 0.6, label: "Walkable days OK" });
  if (dna?.social?.crowds <= 3) prefs.push({ id: "avoid_crowds", weight: 0.85, label: "Avoid crowds" });
  if (dna?.style?.localExperiences) prefs.push({ id: "localness", weight: 0.75, label: "Prefer local experiences" });
  if (dna?.money?.budgetSensitivity >= 7) prefs.push({ id: "value", weight: 0.8, label: "Prefer value" });
  if (dna?.personality?.luxury >= 7) prefs.push({ id: "luxury", weight: 0.7, label: "Prefer luxury stays" });
  return prefs;
}

/**
 * Pull live OpenWeather into the World Model. When rain ≥ 60%, optionally
 * fire Guardian auto-replan (outdoor activities swap).
 */
export async function syncWeatherAndMaybeReplan(
  userId: string,
  tripId: string,
  opts: { autoReplan?: boolean } = { autoReplan: true },
) {
  const graph = new TravelGraph(userId);
  const trip = await graph.getTrip({ tripId });
  if (!trip) return { ok: false as const, reason: "trip_not_found" };

  const wx = await fetchWeather(trip.destination);
  const world = mutateWorld(tripId, {
    weather: { condition: wx.condition, tempC: wx.tempC, rainChance: wx.rainChance },
  });

  const needsReplan = shouldReplanForWeather(wx);
  const already = world.disruptions.some((d) => d.includes("Auto-weather"));
  let replan: unknown = null;

  if (needsReplan && !already) {
    mutateWorld(tripId, {
      inject: `Auto-weather: ${wx.condition} (${wx.rainChance}% rain)`,
    });
    if (opts.autoReplan !== false) {
      const { GuardianAgent } = await import("../agents/guardian");
      const { defaultAutonomy } = await import("../agents/orchestrator");
      const guardian = new GuardianAgent({ userId, tripId, autonomy: defaultAutonomy() });
      replan = await guardian.replan("WEATHER_CHANGED", {
        condition: wx.condition,
        rainChance: wx.rainChance,
        summary: `Auto OpenWeather replan — ${wx.condition} ${wx.rainChance}%`,
        auto: true,
      });
    }
  }

  return {
    ok: true as const,
    weather: wx,
    needsReplan,
    replanned: !!replan,
    replan,
    world: getWorldSignals(tripId),
  };
}

export function effectiveCostBreakdown(cashUsd: number, transportUsd = 0) {
  const rewards = valueRewards(cashUsd);
  const effective = Math.max(0, cashUsd + transportUsd - (cashUsd - rewards.effectiveCostUsd));
  return {
    cashUsd,
    transportUsd,
    rewardsValueUsd: Math.round((cashUsd - rewards.effectiveCostUsd) * 100) / 100,
    effectiveUsd: Math.round((cashUsd + transportUsd - (cashUsd - rewards.effectiveCostUsd)) * 100) / 100,
    roveMiles: rewards.roveMiles,
    story: rewards.story,
  };
}
