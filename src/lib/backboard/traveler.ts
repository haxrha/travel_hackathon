/**
 * Cross-trip traveler memory.
 *
 * Each user gets one Backboard assistant. Every trip is its own thread.
 * Planning turns send the traveler's words with memory: "Auto", so facts
 * ("aisle seats", "vegetarian", "$150/night") accumulate on the assistant
 * and come back on the next trip without passing the old thread id.
 *
 * Without BACKBOARD_API_KEY the same facts are kept in the traveler profile
 * so the demo still shows recall. The memory page labels which store is live.
 */

import {
  addMemory,
  createTravelerAssistant,
  listMemories,
  searchMemories,
  sendMemoryMessage,
  waitForMemoryOperation,
} from "./client";
import { isBackboardConfigured } from "./env";
import { dedupeFacts, extractTravelerFacts, factsFromMemoryText, mergeFacts } from "./facts";
import { loadMemory, saveMemory, stampTripMemory } from "./store";
import type { MemoryTurn, TravelerFact } from "./types";

async function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function recallTravelerMemory(input: {
  userId: string;
  tripId?: string;
  text: string;
}): Promise<MemoryTurn> {
  const binding = await loadMemory(input.userId);
  const configured = isBackboardConfigured();
  let remote: TravelerFact[] = [];

  if (configured && binding.assistantId) {
    remote = await withDeadline(pullRemoteFacts(binding.assistantId, input.text), 5_000, []);
  }

  const recalled = mergeFacts(binding.facts, remote);
  const extracted = extractTravelerFacts(input.text).map((fact) => ({
    ...fact,
    tripId: input.tripId,
    source: fact.source,
  }));
  const learned = extracted.filter((fact) => !recalled.some((prev) => prev.id === fact.id));
  const applied = mergeFacts(recalled, extracted);

  if (remote.length) {
    binding.facts = mergeFacts(binding.facts, remote);
    await saveMemory(input.userId, binding);
  }

  return {
    configured,
    provider: configured ? "backboard" : "local",
    assistantId: binding.assistantId,
    recalled,
    learned,
    applied,
  };
}

export async function persistTravelerMemory(input: {
  userId: string;
  tripId?: string;
  text: string;
  learned: TravelerFact[];
  applied: TravelerFact[];
}): Promise<MemoryTurn> {
  const binding = await loadMemory(input.userId);
  const configured = isBackboardConfigured();
  const learned = input.learned.map((fact) => ({ ...fact, tripId: input.tripId ?? fact.tripId }));
  binding.facts = mergeFacts(binding.facts, learned.length ? learned : input.applied);
  // Persist the local mirror before the Backboard round-trip so a slow Auto
  // write cannot drop the facts the next trip needs.
  await saveMemory(input.userId, binding);
  stampTripMemory(input.tripId, input.applied);

  let error: string | undefined;
  let threadId = input.tripId ? binding.threads[input.tripId] : undefined;

  if (configured && input.text.trim()) {
    try {
      if (!binding.assistantId) {
        binding.assistantId = await createTravelerAssistant(input.userId.slice(0, 12));
      }
      const message = await sendMemoryMessage({
        assistantId: binding.assistantId,
        threadId,
        memory: "Auto",
        content: [
          "Traveler said while planning a trip. Remember only durable preferences (seat, diet, red-eyes, nightly hotel ceiling, accessibility). Ignore one-off destinations and dates.",
          "",
          input.text.trim(),
          "",
          "Reply with ACK and the facts you stored, one per line.",
        ].join("\n"),
      });
      if (input.tripId && message.threadId) {
        binding.threads[input.tripId] = message.threadId;
        threadId = message.threadId;
      }
      if (message.memoryOperationId) {
        await waitForMemoryOperation(message.memoryOperationId, 2_000);
      }
      const remote = await pullRemoteFacts(binding.assistantId, input.text);
      if (remote.length) {
        binding.facts = mergeFacts(binding.facts, remote);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      // Auto write failed (model access, network). Still store the sentences
      // on the assistant so the next trip can list them.
      if (binding.assistantId && learned.length) {
        try {
          for (const fact of learned) {
            const memoryId = await addMemory(binding.assistantId, fact.content, {
              tripId: input.tripId,
              kind: fact.kind,
            });
            fact.source = "backboard";
            if (memoryId) fact.backboardMemoryId = memoryId;
          }
          binding.facts = mergeFacts(
            binding.facts.filter((f) => !learned.some((l) => l.id === f.id)),
            learned,
          );
          error = `${error} Facts were stored on the assistant directly.`;
        } catch (fallbackErr) {
          const extra = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          error = `${error} Direct memory write also failed: ${extra}`;
        }
      }
    }
  }

  await saveMemory(input.userId, binding);
  stampTripMemory(input.tripId, binding.facts.length ? mergeFacts(binding.facts, input.applied) : input.applied);

  return {
    configured,
    provider: configured ? "backboard" : "local",
    assistantId: binding.assistantId,
    threadId,
    recalled: input.applied.filter((fact) => !learned.some((item) => item.id === fact.id)),
    learned,
    applied: mergeFacts(binding.facts, input.applied),
    memoryMode: configured ? "Auto" : undefined,
    error,
  };
}

export async function listTravelerMemory(userId: string) {
  const binding = await loadMemory(userId);
  return {
    configured: isBackboardConfigured(),
    provider: isBackboardConfigured() ? ("backboard" as const) : ("local" as const),
    assistantId: binding.assistantId,
    facts: binding.facts,
  };
}

async function pullRemoteFacts(assistantId: string, query: string): Promise<TravelerFact[]> {
  const [listed, searched] = await Promise.all([
    listMemories(assistantId).catch(() => []),
    searchMemories(assistantId, query.slice(0, 400) || "traveler preferences", 8).catch(() => []),
  ]);
  const rows = dedupeByContent([...listed, ...searched]);
  return dedupeFacts(
    rows.flatMap((row) =>
      factsFromMemoryText(row.content, "backboard", {
        backboardMemoryId: row.id,
      }),
    ),
  );
}

function dedupeByContent<T extends { content: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.content.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
