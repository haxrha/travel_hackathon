/**
 * Risk-aware / probabilistic travel planning.
 * Flights aren't on-time deltas — they're arrival distributions.
 * Downstream reservations are scored by P(success | arrival).
 */

export type ArrivalBucket = {
  label: string;
  /** Minutes after midnight */
  minutes: number;
  probability: number;
};

export type TimedOption = {
  id: string;
  label: string;
  /** Minutes after midnight */
  minutes: number;
  /** Buffer needed after landing before sitting down (transit + hotel drop) */
  bufferMinutes?: number;
};

export type RiskDecision = {
  arrival: ArrivalBucket[];
  options: {
    id: string;
    label: string;
    timeLabel: string;
    successProbability: number;
    chosen: boolean;
  }[];
  chosenId: string;
  rationale: string;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** Default long-haul delay distribution around scheduled landing. */
export function flightArrivalDistribution(
  scheduledHour: number,
  scheduledMinute = 30,
): ArrivalBucket[] {
  const base = scheduledHour * 60 + scheduledMinute;
  const raw: ArrivalBucket[] = [
    { label: formatClock(base), minutes: base, probability: 0.65 },
    { label: formatClock(base + 30), minutes: base + 30, probability: 0.2 },
    { label: formatClock(base + 60), minutes: base + 60, probability: 0.1 },
    { label: `${formatClock(base + 90)}+`, minutes: base + 90, probability: 0.05 },
  ];
  return raw;
}

export function formatClock(minutes: number) {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/**
 * P(ready for reservation by dinner start) =
 * sum over arrival buckets where arrival + buffer <= dinner.
 */
export function dinnerSuccessProbability(
  dinnerMinutes: number,
  arrival: ArrivalBucket[],
  bufferMinutes = 90,
): number {
  let p = 0;
  for (const b of arrival) {
    if (b.minutes + bufferMinutes <= dinnerMinutes) p += b.probability;
  }
  return Math.round(clamp01(p) * 100);
}

/** Pick the earliest dinner that clears a success threshold, else the safest. */
export function chooseSafeReservation(
  arrival: ArrivalBucket[],
  candidates: TimedOption[],
  opts: { minSuccessPct?: number; bufferMinutes?: number } = {},
): RiskDecision {
  const minSuccess = opts.minSuccessPct ?? 90;
  const buffer = opts.bufferMinutes ?? 90;

  const scored = candidates.map((c) => {
    const successProbability = dinnerSuccessProbability(c.minutes, arrival, buffer);
    return {
      id: c.id,
      label: c.label,
      timeLabel: formatClock(c.minutes),
      successProbability,
      chosen: false,
    };
  });

  const preferred =
    scored.find((s) => s.successProbability >= minSuccess) ??
    [...scored].sort((a, b) => b.successProbability - a.successProbability)[0]!;

  const withChoice = scored.map((s) => ({ ...s, chosen: s.id === preferred.id }));
  const rejected = scored.find((s) => !s.chosen && s.successProbability < preferred.successProbability);

  const rationale = rejected
    ? `Arrival is probabilistic (not a single ETA). ${rejected.label} at ${rejected.timeLabel} only clears ${rejected.successProbability}% of arrival mass after a ${buffer}m buffer — below the ${minSuccess}% safety bar. ${preferred.label} at ${preferred.timeLabel} clears ${preferred.successProbability}%, so WAYPORT booked that instead.`
    : `${preferred.label} at ${preferred.timeLabel} maximizes success probability (${preferred.successProbability}%) given the arrival distribution.`;

  return {
    arrival,
    options: withChoice,
    chosenId: preferred.id,
    rationale,
  };
}

/** Day-0 flight → dinner decision used by Planner / skeleton. */
export function day0DinnerRiskDecision(_scheduledArrivalHour = 16, _scheduledArrivalMinute = 30): RiskDecision {
  // Demo distribution tuned so 7:00 is unsafe (~71%) and 7:45 clears the bar (~96%).
  const arrival: ArrivalBucket[] = [
    { label: "4:30 PM", minutes: 16 * 60 + 30, probability: 0.55 },
    { label: "5:00 PM", minutes: 17 * 60, probability: 0.16 },
    { label: "5:45 PM", minutes: 17 * 60 + 45, probability: 0.25 },
    { label: "6:30+ PM", minutes: 18 * 60 + 30, probability: 0.04 },
  ];
  return chooseSafeReservation(
    arrival,
    [
      { id: "dinner-1900", label: "Dinner 7:00", minutes: 19 * 60 },
      { id: "dinner-1945", label: "Dinner 7:45", minutes: 19 * 60 + 45 },
    ],
    { minSuccessPct: 90, bufferMinutes: 90 },
  );
}
