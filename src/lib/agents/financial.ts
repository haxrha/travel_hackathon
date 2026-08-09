import { prisma } from "@/server/db/client";
import { BaseAgent, type AgentContext } from "./base";

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
