import { prisma } from "@/server/db/client";
import { nightlyCeiling } from "../backboard/facts";
import type { TravelerFact } from "../backboard/types";
import { demoStore, isMemoryGraph } from "../demo/store";
import { BaseAgent } from "./base";

/**
 * Financial Agent — understands the money layer: budget, actual spend,
 * refunds, deposits, FX, split payments, rewards valuation.
 */
export class FinancialAgent extends BaseAgent {
  kind = "FINANCIAL" as const;

  async syncTripMoney(tripId: string) {
    const budget = await prisma.budget.findUnique({ where: { tripId } });
    if (!budget) return null;

    const bookings = await prisma.booking.findMany({
      where: { tripItem: { tripId }, status: { in: ["CONFIRMED", "HELD", "PENDING"] } },
    });
    const actual = bookings.reduce((a: number, b: any) => a + Number(b.totalPrice), 0);
    const expenses = await prisma.expense.findMany({ where: { tripId, status: { in: ["PAID", "PENDING"] } } });
    const expenseTotal = expenses.reduce((a: number, e: any) => a + Number(e.amount), 0);
    const combined = actual + expenseTotal;

    await prisma.budget.update({
      where: { tripId },
      data: { actual: combined, remaining: budget.totalBudget.minus(combined) },
    });

    return { total: budget.totalBudget, estimated: budget.estimated, actual: combined, remaining: budget.totalBudget.minus(combined) };
  }

  /**
   * Apply remembered budget ceilings before spend is estimated.
   * The ceiling comes from Backboard (or the local mirror) and is not
   * re-typed on every trip.
   */
  async enforceTravelerMemory(facts: TravelerFact[]) {
    const ceiling = nightlyCeiling(facts);
    const summary = facts.map((f) => f.content);
    await this.logAction({
      action: "apply_traveler_memory",
      tool: "backboard",
      input: { facts: summary, hotelNightlyCeilingUsd: ceiling },
      result: {
        hotelNightlyCeilingUsd: ceiling,
        enforced: facts.map((f) => f.content),
      },
      status: "INFO",
    });

    if (!this.ctx.tripId) return { hotelNightlyCeilingUsd: ceiling };

    if (isMemoryGraph()) {
      const trip = demoStore.getTrip(this.ctx.userId, this.ctx.tripId);
      if (trip?.budgets?.[0] && ceiling) {
        const categories = {
          ...((trip.budgets[0] as { categories?: Record<string, unknown> }).categories ?? {}),
          hotelNightlyCeilingUsd: ceiling,
        };
        (trip.budgets[0] as { categories?: Record<string, unknown> }).categories = categories;
      }
      demoStore.setTripMeta(this.ctx.tripId, {
        hotelNightlyCeilingUsd: ceiling,
        travelerMemory: summary,
      });
      return { hotelNightlyCeilingUsd: ceiling };
    }

    if (ceiling) {
      const budget = await prisma.budget.findUnique({ where: { tripId: this.ctx.tripId } });
      if (budget) {
        const categories = {
          ...((budget.categories ?? {}) as Record<string, unknown>),
          hotelNightlyCeilingUsd: ceiling,
        };
        await prisma.budget.update({
          where: { tripId: this.ctx.tripId },
          data: { categories },
        });
      }
    }
    return { hotelNightlyCeilingUsd: ceiling };
  }

  async recordExpense(input: { tripId: string; itemId?: string; title: string; amount: number; currency: string; category: string; paidBy?: string }) {
    return prisma.expense.create({
      data: {
        tripId: input.tripId,
        itemId: input.itemId,
        title: input.title,
        amount: input.amount,
        currency: input.currency,
        category: input.category,
        paidBy: input.paidBy ?? this.ctx.userId,
        status: "PAID",
        occurredAt: new Date(),
      },
    });
  }
}
