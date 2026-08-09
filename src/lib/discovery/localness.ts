/**
 * Hidden Gem Discovery — Localness Score (not Google stars).
 */

import type { TavilyResult } from "../tools/search/tavily";

export type LocalnessBreakdown = {
  touristDensity: "low" | "moderate" | "high";
  localReviewRatio: "low" | "moderate" | "high";
  chainProbability: number; // 0–100
  creatorMentions: "low" | "moderate" | "high";
  neighborhoodFit: "low" | "moderate" | "high";
  distanceMinutes: number;
};

export type LocalnessScore = {
  score: number; // 0–100
  breakdown: LocalnessBreakdown;
  blurb: string;
  title: string;
  url?: string;
  content: string;
};

const CHAIN_RE = /\b(mcdonald|starbucks|hilton|marriott|chain|franchise|hard rock)\b/i;
const LOCAL_RE = /\b(local|locals|neighborhood|family[- ]owned|mom[- ]and[- ]pop|izakaya|hole[- ]in[- ]the[- ]wall|hidden gem)\b/i;
const TOURIST_RE = /\b(top 10|instagram|must[- ]see|tripadvisor|tourist|famous|iconic|bucket list)\b/i;
const CREATOR_RE = /\b(youtub|vlog|creator|tiktok|blogger|influencer| Nomad|wayport)\b/i;

function band(n: number): "low" | "moderate" | "high" {
  if (n < 34) return "low";
  if (n < 67) return "moderate";
  return "high";
}

export function computeLocalness(result: TavilyResult, seed = 0): LocalnessScore {
  const text = `${result.title} ${result.content}`.toLowerCase();
  const touristHits = (text.match(TOURIST_RE) || []).length;
  const localHits = (text.match(LOCAL_RE) || []).length;
  const chain = CHAIN_RE.test(text) ? 72 + (seed % 20) : Math.max(0, 8 + (seed % 12) - localHits * 3);
  const touristDensityScore = Math.min(100, touristHits * 28 + (result.score && result.score > 0.85 ? 20 : 0));
  const localRatioScore = Math.min(100, 35 + localHits * 22 + (LOCAL_RE.test(text) ? 20 : 0));
  const creatorScore = CREATOR_RE.test(text) ? 55 + (seed % 25) : 20 + (seed % 15);
  const neighborhoodFit = Math.min(100, 40 + localHits * 15 + (seed % 20));
  const distanceMinutes = 6 + ((seed + text.length) % 18);

  // Localness = high local, low tourist, low chain, decent creator signal, walkable
  const score = Math.round(
    clamp(
      localRatioScore * 0.35 +
        (100 - touristDensityScore) * 0.25 +
        (100 - chain) * 0.2 +
        creatorScore * 0.1 +
        neighborhoodFit * 0.1 -
        Math.max(0, distanceMinutes - 15) * 0.8,
      12,
      98,
    ),
  );

  const breakdown: LocalnessBreakdown = {
    touristDensity: band(touristDensityScore),
    localReviewRatio: band(localRatioScore),
    chainProbability: Math.round(clamp(chain, 0, 100)),
    creatorMentions: band(creatorScore),
    neighborhoodFit: band(neighborhoodFit),
    distanceMinutes,
  };

  const blurb =
    score >= 80
      ? "This is more likely to feel like a place locals actually use."
      : score >= 60
        ? "Solid neighborhood fit — not a postcard trap, not fully off-grid."
        : "Leans tourist-facing; keep as a backup, not the local anchor.";

  return {
    score,
    breakdown,
    blurb,
    title: result.title,
    url: result.url,
    content: result.content,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Rank Tavily (or mock) results by Localness Score. */
export function rankByLocalness(results: TavilyResult[]): LocalnessScore[] {
  return results
    .map((r, i) => computeLocalness(r, i * 17 + r.title.length))
    .sort((a, b) => b.score - a.score);
}
