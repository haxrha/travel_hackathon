/**
 * Natural-language trip edits → structured constraints → recompute.
 */

export type EditIntent = {
  raw: string;
  budgetDeltaUsd?: number;
  delayDays?: number;
  maxSteps?: number;
  prioritizeLocal?: boolean;
  removeRentalCar?: boolean;
  maximizeRewards?: boolean;
  lowEnergy?: boolean;
  avoidRain?: boolean;
  notes: string[];
};

export function parseEditIntent(text: string): EditIntent {
  const t = text.toLowerCase();
  const notes: string[] = [];
  const intent: EditIntent = { raw: text, notes };

  const spend = t.match(/(?:spend|budget)\s*\$?\s*(\d+)\s*(?:more|extra)/) || t.match(/\$\s*(\d+)\s*more/);
  if (spend) {
    intent.budgetDeltaUsd = Number(spend[1]);
    notes.push(`Budget +$${intent.budgetDeltaUsd}`);
  }
  const less = t.match(/(?:spend|cut|reduce)\s*\$?\s*(\d+)\s*(?:less|fewer)/);
  if (less) {
    intent.budgetDeltaUsd = -(Number(less[1]));
    notes.push(`Budget −$${Math.abs(intent.budgetDeltaUsd)}`);
  }

  if (/one day later|leave (a )?day later|depart(ure)? (a )?day later|delay (by )?1 day|push.*(day|departure)/.test(t)) {
    intent.delayDays = 1;
    notes.push("Shift departure +1 day");
  }
  if (/two days later|leave (a )?couple days later/.test(t)) {
    intent.delayDays = 2;
    notes.push("Shift departure +2 days");
  }

  const steps = t.match(/(\d[\d,]*)\s*steps/) || t.match(/walk(?:ing)?\s*(?:more than|over|under|≤|<=|less than)?\s*(\d[\d,]*)/);
  if (steps || /don'?t want to walk|limit walking|max walking/.test(t)) {
    const n = steps ? Number(steps[1].replace(/,/g, "")) : 5000;
    intent.maxSteps = n;
    notes.push(`Max ~${n.toLocaleString()} steps/day`);
  }

  if (/prioritize local|more local|local experiences|hidden gem|authenticity/.test(t)) {
    intent.prioritizeLocal = true;
    notes.push("Prioritize local experiences");
  }
  if (/remove (the )?rental|no (rental )?car|drop (the )?car|without (a )?car/.test(t)) {
    intent.removeRentalCar = true;
    notes.push("Remove rental car");
  }
  if (/maximize rewards|rove miles|points|miles/.test(t)) {
    intent.maximizeRewards = true;
    notes.push("Maximize rewards / effective cost");
  }
  if (/tired|low energy|get tired|easy pace|slow travel|rest more/.test(t)) {
    intent.lowEnergy = true;
    notes.push("Lower energy day shape");
  }
  if (/avoid rain|no rain|indoor|rainy|weather/.test(t)) {
    intent.avoidRain = true;
    notes.push("Prefer indoor / covered options");
  }

  if (notes.length === 0) notes.push("General recompute from free-text preference");
  return intent;
}

export type RecomputeChange = {
  action: "shift" | "remove" | "replace" | "budget" | "add" | "retitle";
  detail: string;
};

export type RecomputeResult = {
  intent: EditIntent;
  changes: RecomputeChange[];
  summary: string;
};

type MutableItem = {
  id: string;
  kind: string;
  title: string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  payload?: Record<string, unknown> | null;
};

/**
 * Mutate trip items in place according to edit intent (demo-friendly).
 */
export function applyEditToItems(
  items: MutableItem[],
  intent: EditIntent,
  budget?: { totalBudget: number; actual: number; remaining: number },
): RecomputeResult {
  const changes: RecomputeChange[] = [];

  if (intent.delayDays && intent.delayDays > 0) {
    const ms = intent.delayDays * 86400000;
    for (const it of items) {
      if (it.startTime) it.startTime = new Date(new Date(it.startTime).getTime() + ms);
      if (it.endTime) it.endTime = new Date(new Date(it.endTime).getTime() + ms);
    }
    changes.push({ action: "shift", detail: `All nodes shifted +${intent.delayDays} day(s)` });
  }

  if (intent.removeRentalCar) {
    const before = items.length;
    for (let i = items.length - 1; i >= 0; i--) {
      const title = items[i].title.toLowerCase();
      if (/rental|car hire|avis|hertz|enterprise/.test(title) || (items[i].kind === "TRANSFER" && /car|drive/.test(title))) {
        changes.push({ action: "remove", detail: `Removed “${items[i].title}”` });
        items.splice(i, 1);
      }
    }
    if (items.length === before) {
      // Convert a transfer to transit as stand-in
      const transfer = items.find((i) => i.kind === "TRANSFER");
      if (transfer) {
        transfer.kind = "TRANSIT";
        transfer.title = transfer.title.replace(/car|drive/gi, "transit") || "Local transit";
        if (transfer.payload) transfer.payload.priceUsd = Math.min(Number(transfer.payload.priceUsd ?? 40), 18);
        changes.push({ action: "replace", detail: `Swapped car transfer → “${transfer.title}”` });
      }
    }
  }

  if (intent.maxSteps != null) {
    for (const it of items) {
      if (it.kind === "ACTIVITY" || it.kind === "LANDMARK") {
        const title = it.title;
        if (!/short|nearby|compact|easy/.test(title.toLowerCase())) {
          it.title = `Compact · ${title}`;
          it.payload = {
            ...(it.payload ?? {}),
            maxSteps: intent.maxSteps,
            notes: `Capped walking ≈ ${intent.maxSteps.toLocaleString()} steps`,
            description:
              (it.payload?.description as string) ??
              `Recomputed for ≤ ${intent.maxSteps.toLocaleString()} steps — closer stops, less roaming.`,
          };
          changes.push({ action: "retitle", detail: `Walking cap applied to “${it.title}”` });
        }
      }
    }
  }

  if (intent.prioritizeLocal) {
    for (const it of items) {
      if (it.kind === "RESTAURANT" || it.kind === "ACTIVITY" || it.kind === "EXPERIENCE") {
        if (!/local|hidden|neighborhood/.test(it.title.toLowerCase())) {
          it.title = `Local · ${it.title}`;
        }
        it.payload = {
          ...(it.payload ?? {}),
          localnessPriority: true,
          description: "Re-ranked toward Localness Score — places locals actually use.",
        };
        changes.push({ action: "replace", detail: `Localness bias → “${it.title}”` });
      }
    }
  }

  if (intent.lowEnergy) {
    for (const it of items) {
      if (it.kind === "ACTIVITY") {
        const start = it.startTime ? new Date(it.startTime) : null;
        if (start && start.getHours() < 11) {
          start.setHours(11, 0, 0, 0);
          it.startTime = start;
        }
        it.title = it.title.replace(/^/, "").includes("Easy") ? it.title : `Easy pace · ${it.title}`;
        it.payload = { ...(it.payload ?? {}), energy: "low" };
        changes.push({ action: "shift", detail: `Softened “${it.title}” for low energy` });
      }
    }
  }

  if (intent.avoidRain) {
    for (const it of items) {
      if (it.kind === "ACTIVITY" || it.kind === "LANDMARK") {
        it.title = /indoor|covered|museum|gallery/.test(it.title.toLowerCase())
          ? it.title
          : `Indoor backup · ${it.title}`;
        it.payload = {
          ...(it.payload ?? {}),
          weatherSafe: true,
          notes: "Swapped / tagged for rain avoidance",
        };
        changes.push({ action: "replace", detail: `Rain-safe → “${it.title}”` });
      }
    }
  }

  if (intent.maximizeRewards) {
    for (const it of items) {
      if (it.kind === "HOTEL" || it.kind === "FLIGHT") {
        const price = Number(it.payload?.priceUsd ?? 200);
        it.payload = {
          ...(it.payload ?? {}),
          priceUsd: Math.round(price * 1.05),
          rewardsBias: true,
          notes: "Biased toward partner inventory for Rove / transferable points",
        };
        changes.push({ action: "budget", detail: `Rewards-biased “${it.title}”` });
      }
    }
  }

  if (intent.budgetDeltaUsd && budget) {
    budget.totalBudget = Math.max(200, Number(budget.totalBudget) + intent.budgetDeltaUsd);
    if (intent.budgetDeltaUsd > 0) {
      // Upgrade a hotel / dinner
      const hotel = items.find((i) => i.kind === "HOTEL");
      if (hotel?.payload) {
        hotel.payload.priceUsd = Number(hotel.payload.priceUsd ?? 200) + Math.round(intent.budgetDeltaUsd * 0.4);
        hotel.title = hotel.title.includes("Upgrade") ? hotel.title : `Upgrade · ${hotel.title}`;
        changes.push({ action: "budget", detail: `Hotel upgraded with +$${intent.budgetDeltaUsd} headroom` });
      }
      const dinner = items.find((i) => i.kind === "RESTAURANT");
      if (dinner?.payload) {
        dinner.payload.priceUsd = Number(dinner.payload.priceUsd ?? 60) + Math.round(intent.budgetDeltaUsd * 0.15);
        changes.push({ action: "budget", detail: "Dining allowance raised" });
      }
    } else {
      for (const it of items) {
        if (it.payload?.priceUsd != null) {
          it.payload.priceUsd = Math.round(Number(it.payload.priceUsd) * 0.92);
        }
      }
      changes.push({ action: "budget", detail: `Compressed spend for ${intent.budgetDeltaUsd} budget delta` });
    }
    const actual = items.reduce((s, i) => s + Number(i.payload?.priceUsd ?? 0), 0);
    budget.actual = actual;
    budget.remaining = Math.max(0, budget.totalBudget - actual);
  }

  const unique = [...new Map(changes.map((c) => [c.detail, c])).values()];
  return {
    intent,
    changes: unique,
    summary:
      unique.length === 0
        ? "No structural changes — preferences noted on graph."
        : `Recomputed ${unique.length} adjustment${unique.length === 1 ? "" : "s"} from “${intent.raw}”.`,
  };
}
