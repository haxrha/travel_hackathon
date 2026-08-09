/**
 * Decision transparency — explain why one candidate beat another.
 */

export type DecisionFactor = {
  key: string;
  label: string;
  value: string | number;
  /** Contribution toward the winner (− / +) */
  weight?: number;
};

export type RankedCandidate = {
  id: string;
  title: string;
  score: number;
  factors: DecisionFactor[];
  rejectedReason?: string;
};

export type DecisionTrace = {
  agent: string;
  tool: string;
  question: string;
  winnerId: string;
  winnerTitle: string;
  candidates: RankedCandidate[];
  summary: string;
};

export function buildDecisionTrace(input: {
  agent: string;
  tool: string;
  question: string;
  candidates: RankedCandidate[];
}): DecisionTrace {
  const sorted = [...input.candidates].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const runner = sorted[1];
  const summary = winner
    ? runner
      ? `Chose “${winner.title}” (score ${winner.score}) over “${runner.title}” (score ${runner.score}). ${diffBlurb(winner, runner)}`
      : `Chose “${winner.title}” with score ${winner.score}.`
    : "No candidates.";

  return {
    agent: input.agent,
    tool: input.tool,
    question: input.question,
    winnerId: winner?.id ?? "",
    winnerTitle: winner?.title ?? "",
    candidates: sorted.map((c, i) => ({
      ...c,
      rejectedReason: i === 0 ? undefined : c.rejectedReason ?? `Score ${c.score} < winner ${winner?.score}`,
    })),
    summary,
  };
}

function diffBlurb(a: RankedCandidate, b: RankedCandidate) {
  const aKeys = new Map(a.factors.map((f) => [f.key, f]));
  const highlights: string[] = [];
  for (const f of b.factors) {
    const other = aKeys.get(f.key);
    if (!other) continue;
    const av = typeof other.value === "number" ? other.value : null;
    const bv = typeof f.value === "number" ? f.value : null;
    if (av != null && bv != null && Math.abs(av - bv) >= 5) {
      highlights.push(`${other.label} ${av} vs ${bv}`);
    }
  }
  return highlights.length ? `Key deltas: ${highlights.slice(0, 3).join(" · ")}.` : "Highest composite match.";
}
