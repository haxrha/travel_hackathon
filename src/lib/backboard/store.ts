import { prisma } from "@/server/db/client";
import { demoStore, getOrCreateProfile, isMemoryGraph } from "../demo/store";
import { dedupeFacts, factsFromMemoryText } from "./facts";
import { serverEnv } from "../server-env";
import type { TravelerFact, TravelerMemoryBinding } from "./types";

function emptyBinding(): TravelerMemoryBinding {
  return { threads: {}, facts: [] };
}

function ensureDemoBinding(userId: string): TravelerMemoryBinding {
  const profile = getOrCreateProfile(userId);
  if (!profile.memory) profile.memory = emptyBinding();
  if (!profile.memory.threads) profile.memory.threads = {};
  if (!profile.memory.facts) profile.memory.facts = [];
  const pinned = serverEnv("BACKBOARD_ASSISTANT_ID");
  if (!profile.memory.assistantId && pinned) profile.memory.assistantId = pinned;
  return profile.memory;
}

export async function loadMemory(userId: string): Promise<TravelerMemoryBinding> {
  if (isMemoryGraph()) return ensureDemoBinding(userId);
  try {
    const profile = await prisma.travelerProfile.findUnique({ where: { userId } });
    const dna = (profile?.dna ?? {}) as Record<string, unknown>;
    const rows = await prisma.memory.findMany({
      where: { userId, kind: { in: ["PREFERENCE", "LEARNED", "FACT"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const facts = dedupeFacts(
      rows.flatMap((row) =>
        factsFromMemoryText(row.content, rowSource(row.metadata), {
          tripId: row.tripId ?? undefined,
          createdAt: row.createdAt.toISOString(),
          backboardMemoryId:
            row.metadata && typeof row.metadata === "object"
              ? stringMeta(row.metadata, "backboardMemoryId")
              : undefined,
        }),
      ),
    );
    const threads =
      dna.backboardThreads && typeof dna.backboardThreads === "object"
        ? (dna.backboardThreads as Record<string, string>)
        : {};
    const pinned = serverEnv("BACKBOARD_ASSISTANT_ID");
    return {
      assistantId:
        (typeof dna.backboardAssistantId === "string" && dna.backboardAssistantId) || pinned || undefined,
      threads,
      facts,
    };
  } catch {
    return ensureDemoBinding(userId);
  }
}

export async function saveMemory(userId: string, binding: TravelerMemoryBinding): Promise<void> {
  const next: TravelerMemoryBinding = {
    assistantId: binding.assistantId,
    threads: binding.threads,
    facts: dedupeFacts(binding.facts),
  };
  if (isMemoryGraph()) {
    const profile = getOrCreateProfile(userId);
    profile.memory = next;
    return;
  }
  try {
    const profile = await prisma.travelerProfile.findUnique({ where: { userId } });
    if (profile) {
      const dna = { ...((profile.dna ?? {}) as Record<string, unknown>) };
      dna.backboardAssistantId = next.assistantId ?? null;
      dna.backboardThreads = next.threads;
      await prisma.travelerProfile.update({
        where: { userId },
        data: { dna: dna as object },
      });
    }
    for (const fact of next.facts) {
      const existing = await prisma.memory.findFirst({
        where: { userId, content: fact.content },
      });
      if (existing) continue;
      await prisma.memory.create({
        data: {
          userId,
          tripId: fact.tripId,
          kind: fact.kind === "other" ? "FACT" : "PREFERENCE",
          content: fact.content,
          metadata: {
            source: fact.source,
            factKind: fact.kind,
            nightlyUsd: fact.nightlyUsd,
            seat: fact.seat,
            diet: fact.diet,
            avoidsRedEye: fact.avoidsRedEye,
            backboardMemoryId: fact.backboardMemoryId,
          },
        },
      });
    }
  } catch {
    const profile = getOrCreateProfile(userId);
    profile.memory = next;
  }
}

export function stampTripMemory(tripId: string | undefined, facts: TravelerFact[]) {
  if (!tripId || !isMemoryGraph()) return;
  const nightly = facts.find((f) => typeof f.nightlyUsd === "number")?.nightlyUsd;
  demoStore.setTripMeta(tripId, {
    hotelNightlyCeilingUsd: nightly,
    avoidsRedEye: facts.some((f) => f.avoidsRedEye),
    seatPreference: facts.find((f) => f.seat)?.seat,
    travelerMemory: facts.map((f) => f.content),
  });
}

function rowSource(metadata: unknown): TravelerFact["source"] {
  if (metadata && typeof metadata === "object" && (metadata as { source?: string }).source === "backboard") {
    return "backboard";
  }
  return "local";
}

function stringMeta(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
