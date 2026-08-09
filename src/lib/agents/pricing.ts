import { valueRewards } from "@/lib/tools/rewards/valuation";

/** Default prices + experiential copy by item kind */
export function enrichItemMeta(kind: string, title: string, location?: string) {
  const place = location || title;
  const defaults: Record<string, { priceUsd: number; description: string; whatToDo: string[] }> = {
    FLIGHT: {
      priceUsd: 780,
      description: `Long-haul segment — seat selection and lounge access available before departure.`,
      whatToDo: ["Check in online 24h prior", "Reserve seats together", "Download offline maps for arrival city"],
    },
    HOTEL: {
      priceUsd: 220,
      description: `Stay near ${place}. Quiet nights, walkable mornings, and late checkout when autonomy allows.`,
      whatToDo: ["Request quiet room", "Ask about breakfast hours", "Save walking routes to nearby cafés"],
    },
    RESTAURANT: {
      priceUsd: 65,
      description: `Reservation-ready table around ${place} — seasonal plates, local wine list.`,
      whatToDo: ["Confirm dietary needs", "Arrive 10 min early", "Ask the chef for a local specialty"],
    },
    ACTIVITY: {
      priceUsd: 42,
      description: `Timed experience at ${place}. Best light early; expect crowds mid-day.`,
      whatToDo: ["Bring water & comfortable shoes", "Shoot details, not just vistas", "Leave buffer for transit"],
    },
    TRANSFER: {
      priceUsd: 45,
      description: `Door-to-door transfer linking your itinerary nodes.`,
      whatToDo: ["Confirm pickup signage", "Keep confirmation handy", "Track ETA in Wallet"],
    },
    TRANSIT: {
      priceUsd: 12,
      description: `Local transit between stops — IC cards or day passes preferred.`,
      whatToDo: ["Tap in/out correctly", "Stand clear of doors", "Watch for last-train times"],
    },
    EXPERIENCE: {
      priceUsd: 95,
      description: `Guided or ticketed experience near ${place}.`,
      whatToDo: ["Arrive early for check-in", "Ask guide for hidden stops", "Tip if customary"],
    },
    LANDMARK: {
      priceUsd: 18,
      description: `Iconic landmark visit — photography and short exploration.`,
      whatToDo: ["Golden-hour timing", "Combine with nearby café", "Note closing times"],
    },
    EVENT: {
      priceUsd: 75,
      description: `Timed event ticket at ${place}.`,
      whatToDo: ["Screenshot tickets", "Plan rain backup", "Leave early for security lines"],
    },
    CUSTOM: {
      priceUsd: 30,
      description: `Flexible block around ${place}.`,
      whatToDo: ["Keep optional", "Swap if energy dips", "Log notes for DNA"],
    },
  };
  const base = defaults[kind] ?? defaults.CUSTOM;
  // Slight title-based variance
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h + title.charCodeAt(i) * (i + 1)) % 40;
  const priceUsd = Math.round(base.priceUsd * (0.85 + h / 100));
  return { ...base, priceUsd };
}

export type TripOption = {
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

/** Candidate trip shapes scored with Rove effective cost */
export function scoreTripOptions(destination: string, days: number, budgetUsd: number): TripOption[] {
  const variants = [
    {
      id: "value",
      label: "Value · max Rove",
      cashUsd: Math.round(budgetUsd * 0.72),
      why: "Lower nightly rate + more local meals → higher Rove miles per dollar.",
      multiplier: 1.15,
    },
    {
      id: "balanced",
      label: "Balanced · WAYPORT pick",
      cashUsd: Math.round(budgetUsd * 0.88),
      why: "Best mix of walkability, food, and points earn on your DNA.",
      multiplier: 1.0,
    },
    {
      id: "premium",
      label: "Premium · comfort",
      cashUsd: Math.round(budgetUsd * 1.05),
      why: "Higher hotels & experiences — fewer miles per dollar but peak comfort.",
      multiplier: 0.82,
    },
  ];

  return variants
    .map((v) => {
      const rewards = valueRewards(v.cashUsd);
      const score =
        (budgetUsd - rewards.effectiveCostUsd) * 0.4 +
        rewards.roveMiles * 0.01 * v.multiplier +
        (v.id === "balanced" ? 40 : 0);
      return {
        id: v.id,
        label: v.label,
        destination,
        days,
        cashUsd: v.cashUsd,
        roveMiles: rewards.roveMiles,
        effectiveUsd: rewards.effectiveCostUsd,
        why: v.why,
        score: Math.round(score),
      };
    })
    .sort((a, b) => b.score - a.score);
}
