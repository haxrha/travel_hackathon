import { prisma } from "@/server/db/client";
import { BaseAgent } from "./base";
import { GuardianAgent } from "./guardian";

/** Universal Change Agent — handles cancel/change/refund/rebook/upgrade/downgrade/missed connection/supplier failure. */
export class ChangeAgent extends BaseAgent {
  kind = "CHANGE" as const;

  async handle(kind:
    | "cancel"
    | "change"
    | "refund"
    | "rebook"
    | "reschedule"
    | "upgrade"
    | "downgrade"
    | "no_show"
    | "missed_connection"
    | "supplier_failure",
    targetId: string,
  ) {
    const task = await this.startTask({ kind, targetId });
    const item = await prisma.tripItem.findFirst({ where: { id: targetId, trip: { userId: this.ctx.userId } } });
    if (!item) throw new Error("Item not found");

    if (kind === "supplier_failure") {
      await prisma.tripItem.update({ where: { id: item.id }, data: { status: "DISRUPTED" } });
      const guardian = new GuardianAgent(this.ctx);
      await guardian.replan("supplier_failure", { itemId: item.id });
    }

    await this.finishTask(task.id, { kind, targetId } as any);
    return { ok: true, kind, targetId };
  }
}
