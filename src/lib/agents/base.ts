import { prisma } from "@/server/db/client";
import type { AgentKind } from "../db-types";
import { PolicyEngine, type ActionProposal, type AutonomySettings } from "../policy";
import { demoStore, isMemoryGraph } from "../demo/store";

type JsonVal = { [key: string]: unknown } | unknown[];

export interface AgentContext {
  userId: string;
  tripId?: string;
  autonomy: AutonomySettings;
}

export abstract class BaseAgent {
  abstract kind: AgentKind;
  protected policy: PolicyEngine;

  constructor(protected ctx: AgentContext) {
    this.policy = new PolicyEngine(ctx.autonomy);
  }

  async startTask(input: JsonVal) {
    if (isMemoryGraph()) {
      return demoStore.startTask(this.kind, this.ctx.tripId, input);
    }
    return prisma.agentTask.create({
      data: { tripId: this.ctx.tripId, kind: this.kind, status: "RUNNING", input: input as any },
    });
  }

  async finishTask(taskId: string, result?: JsonVal, error?: string) {
    if (isMemoryGraph()) {
      return demoStore.finishTask();
    }
    return prisma.agentTask.update({
      where: { id: taskId },
      data: { status: error ? "FAILED" : "COMPLETED", result: result as any, error, completedAt: new Date() },
    });
  }

  async logAction(a: {
    taskId?: string;
    tool?: string;
    action: string;
    input: JsonVal;
    decision?: JsonVal;
    result?: JsonVal;
    userAuthorization?: boolean;
    rollbackPossible?: boolean;
    status?: "INFO" | "PENDING_APPROVAL" | "APPROVED" | "EXECUTED" | "FAILED" | "CANCELLED";
  }) {
    if (isMemoryGraph()) {
      return demoStore.logAction({
        userId: this.ctx.userId,
        tripId: this.ctx.tripId,
        agent: this.kind,
        tool: a.tool,
        action: a.action,
        input: a.input,
        result: a.result,
        status: a.status ?? "INFO",
      });
    }
    return prisma.agentAction.create({
      data: {
        taskId: a.taskId,
        agent: this.kind,
        tool: a.tool,
        input: a.input as any,
        decision: a.decision as any,
        result: a.result as any,
        userAuthorization: a.userAuthorization,
        rollbackPossible: a.rollbackPossible,
        status: a.status ?? "INFO",
        userId: this.ctx.userId,
        tripId: this.ctx.tripId,
      } as any,
    });
  }

  check(p: ActionProposal) {
    return this.policy.evaluate(p);
  }
}
