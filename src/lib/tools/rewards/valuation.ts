/** Rewards / points valuation + effective cost engine. */

export interface RewardsValuation {
  roveMiles: number;
  creditCardPoints: number;
  loyaltyPoints: number;
  effectiveCostUsd: number;
  story: string;
}

export function valueRewards(priceUsd: number): RewardsValuation {
  const rove = Math.round(priceUsd * 12);
  const cc = Math.round(priceUsd * 3);
  const loyalty = Math.round(priceUsd * 5);
  const value = rove * 0.012 + cc * 0.018 + loyalty * 0.013;
  const effective = Math.max(0, priceUsd - value);
  return {
    roveMiles: rove,
    creditCardPoints: cc,
    loyaltyPoints: loyalty,
    effectiveCostUsd: Math.round(effective * 100) / 100,
    story: `+$${value.toFixed(2)} in rewards value`,
  };
}
