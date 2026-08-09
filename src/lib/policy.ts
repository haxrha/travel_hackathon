/**
 * WAYPORT Policy Engine — the guardrail for every autonomous action.
 *
 * Every action has a risk level (0-5). The Policy Engine decides whether
 * it can execute silently, needs a nudge, or requires explicit user approval.
 * No LLM output can bypass this layer.
 */

export enum RiskLevel {
  // Level 0 — read-only (search, fetch)
  Read = 0,
  // Level 1 — recommend (suggest hotel, propose option)
  Recommend = 1,
  // Level 2 — prepare (create booking draft, hold price)
  Prepare = 2,
  // Level 3 — financial (purchase, spend above threshold)
  Financial = 3,
  // Level 4 — external communication (call hotel, send email to supplier)
  ExternalComm = 4,
  // Level 5 — autonomous (rebook disrupted flight under user threshold)
  AutonomousSpend = 5,
}

export type AutonomyMode = "suggest" | "prepare" | "execute_with_approval" | "execute_automatic";

export interface AutonomySettings {
  mode: AutonomyMode;
  autoBookHotelUnder?: number; // USD per night
  autoBookFlightUnder?: number; // USD
  autoBookRestaurants?: boolean;
  autoBookChangesUnder?: number; // USD
  allowInternationalFlights?: boolean;
  notifyOnlyImportantDisruptions?: boolean;
}

export interface ActionProposal {
  agent: string;
  tool: string;
  action: string;
  amountUsd?: number;
  currency?: string;
  isFinancial?: boolean;
  isExternalComm?: boolean;
  isBooking?: boolean;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  allowed: boolean;
  level: RiskLevel;
  requiresApproval: boolean;
  reason: string;
}

export class PolicyEngine {
  constructor(private settings: AutonomySettings) {}

  evaluate(p: ActionProposal): PolicyDecision {
    const level = classifyRisk(p);
    const { mode } = this.settings;

    // Level 0 / 1 are always safe.
    if (level <= RiskLevel.Recommend) {
      return { allowed: true, level, requiresApproval: false, reason: "read-or-recommend" };
    }

    if (mode === "suggest") {
      return {
        allowed: false,
        level,
        requiresApproval: true,
        reason: "autonomy mode is suggest-only",
      };
    }

    if (mode === "prepare") {
      return {
        allowed: level === RiskLevel.Prepare,
        level,
        requiresApproval: level > RiskLevel.Prepare,
        reason: "prepare-only mode",
      };
    }

    // Execute modes — check threshold rules.
    if (p.isBooking && p.amountUsd != null) {
      const t = p.metadata?.category === "hotel"
        ? this.settings.autoBookHotelUnder
        : p.metadata?.category === "flight"
          ? this.settings.autoBookFlightUnder
          : this.settings.autoBookChangesUnder;

      if (t != null && p.amountUsd <= t) {
        if (p.metadata?.isInternational && !this.settings.allowInternationalFlights) {
          return { allowed: false, level, requiresApproval: true, reason: "international flight blocked" };
        }
        return { allowed: true, level, requiresApproval: false, reason: `under threshold $${t}` };
      }
    }

    if (mode === "execute_with_approval") {
      return { allowed: false, level, requiresApproval: true, reason: "needs explicit approval" };
    }

    // execute_automatic — still cap Level 4/5 behind explicit user opt-in flags
    if (level >= RiskLevel.Financial && !this.settings.autoBookChangesUnder) {
      return { allowed: false, level, requiresApproval: true, reason: "no auto-spend thresholds configured" };
    }

    return { allowed: true, level, requiresApproval: false, reason: "full autonomy enabled" };
  }
}

export function classifyRisk(p: ActionProposal): RiskLevel {
  if (!p.isFinancial && !p.isExternalComm && !p.isBooking) {
    return p.action.startsWith("search") || p.action.startsWith("get_") ? RiskLevel.Read : RiskLevel.Recommend;
  }
  if (p.isBooking && !p.isFinancial) return RiskLevel.Prepare;
  if (p.isFinancial) return RiskLevel.Financial;
  if (p.isExternalComm) return RiskLevel.ExternalComm;
  return RiskLevel.AutonomousSpend;
}
