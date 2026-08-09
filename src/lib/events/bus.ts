import { prisma } from "@/server/db/client";
import type { TripEventType } from "../db-types";
import { demoStore, isMemoryGraph } from "../demo/store";
import { randomUUID } from "crypto";

/**
 * Event Bus — every world change first becomes a TripEvent.
 * Replanning loop consumes events and triggers the appropriate agent.
 */

const memEvents: { id: string; tripId: string; type: string; payload: Record<string, unknown>; processed: boolean; createdAt: Date }[] = [];

export async function emitEvent(tripId: string, type: TripEventType, payload: Record<string, unknown>) {
  if (isMemoryGraph()) {
    const ev = { id: randomUUID(), tripId, type, payload, processed: false, createdAt: new Date() };
    memEvents.push(ev);
    demoStore.logAction({
      userId: "system",
      tripId,
      agent: "GUARDIAN",
      action: `event_${type}`,
      input: payload,
      status: "INFO",
    });
    return ev;
  }
  return prisma.tripEvent.create({
    data: { tripId, type, payload: payload as any },
  });
}

export async function getPendingEvents(tripId: string, limit = 20) {
  if (isMemoryGraph()) {
    return memEvents.filter((e) => e.tripId === tripId && !e.processed).slice(0, limit);
  }
  return prisma.tripEvent.findMany({
    where: { tripId, processed: false },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function markProcessed(ids: string[]) {
  if (isMemoryGraph()) {
    for (const e of memEvents) if (ids.includes(e.id)) e.processed = true;
    return { count: ids.length };
  }
  return prisma.tripEvent.updateMany({ where: { id: { in: ids } }, data: { processed: true } });
}
