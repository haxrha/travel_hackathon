/**
 * Backboard REST client.
 * Docs: https://docs.backboard.io/concepts/memory
 *
 * Memory is per assistant. Reuse one assistant per traveler and omit thread_id
 * to open a new thread that still retrieves that assistant's memories.
 * `memory: "Auto"` saves and retrieves on the same turn.
 */

import { getBackboardEnv } from "./env";

const TIMEOUT_MS = 8_000;

export class BackboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackboardError";
  }
}

export type BackboardMemory = {
  id: string;
  content: string;
};

export type BackboardMessage = {
  content: string;
  threadId?: string;
  assistantId?: string;
  memoryOperationId?: string;
};

const ASSISTANT_PROMPT = `You are WAYPORT's cross-trip traveler memory. You remember durable preferences for one traveler across every trip: seat choice, diet, flight timing, hotel nightly budget ceilings, loyalty programs, and accessibility. A destination or a date is not a standing preference unless the traveler says they always want it. When asked what you remember, answer with only the stored facts, one per line, and do not invent any.`;

const FACT_PROMPT = `Extract only durable traveler preferences: seat (aisle or window), diet (vegetarian, vegan, allergies), flight timing (avoids red-eyes, prefers morning), hotel nightly budget ceiling with the dollar amount, loyalty programs, accessibility. Skip one-off destinations, dates, and itinerary stops. Each memory is a single short sentence.`;

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const { apiKey, baseUrl } = getBackboardEnv();
  if (!apiKey) throw new BackboardError("BACKBOARD_API_KEY is not set");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "X-API-Key": apiKey,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new BackboardError(`${method} ${path} -> ${response.status}: ${text.slice(0, 400)}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BackboardError(`${method} ${path} returned non-JSON`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function createTravelerAssistant(userLabel: string): Promise<string> {
  const data = asRecord(
    await call("POST", "/assistants", {
      name: `WAYPORT traveler ${userLabel}`.slice(0, 80),
      system_prompt: ASSISTANT_PROMPT,
      custom_fact_extraction_prompt: FACT_PROMPT,
    }),
  );
  const id = data.assistant_id ?? data.assistantId ?? data.id;
  if (typeof id !== "string" || !id) {
    throw new BackboardError("Create assistant did not return assistant_id");
  }
  return id;
}

export async function sendMemoryMessage(input: {
  assistantId: string;
  content: string;
  threadId?: string;
  memory: "Auto" | "Readonly" | "off";
}): Promise<BackboardMessage> {
  const { llmProvider, modelName } = getBackboardEnv();
  const payload: Record<string, unknown> = {
    assistant_id: input.assistantId,
    content: input.content,
    stream: false,
    memory: input.memory,
    llm_provider: llmProvider,
    model_name: modelName,
  };
  if (input.threadId) payload.thread_id = input.threadId;
  const data = asRecord(await call("POST", "/threads/messages", payload));
  return {
    content: typeof data.content === "string" ? data.content : "",
    threadId: stringField(data, "thread_id", "threadId"),
    assistantId: stringField(data, "assistant_id", "assistantId"),
    memoryOperationId: stringField(data, "memory_operation_id", "memoryOperationId"),
  };
}

export async function addMemory(assistantId: string, content: string, metadata?: Record<string, unknown>) {
  const data = asRecord(
    await call("POST", `/assistants/${assistantId}/memories`, {
      content,
      metadata: { source: "wayport", ...metadata },
    }),
  );
  return stringField(data, "memory_id", "memoryId", "id");
}

export async function listMemories(assistantId: string): Promise<BackboardMemory[]> {
  const data = asRecord(await call("GET", `/assistants/${assistantId}/memories?page=1&page_size=100`));
  const rows = Array.isArray(data.memories) ? data.memories : Array.isArray(data) ? data : [];
  return rows.map(normalizeMemory).filter((m): m is BackboardMemory => Boolean(m));
}

export async function searchMemories(assistantId: string, query: string, limit = 8): Promise<BackboardMemory[]> {
  const data = asRecord(
    await call("POST", `/assistants/${assistantId}/memories/search`, {
      query,
      limit,
    }),
  );
  const rows = Array.isArray(data.memories) ? data.memories : [];
  return rows.map(normalizeMemory).filter((m): m is BackboardMemory => Boolean(m));
}

export async function memoryOperationStatus(operationId: string): Promise<string> {
  const data = asRecord(await call("GET", `/assistants/memories/operations/${operationId}`));
  return typeof data.status === "string" ? data.status : "UNKNOWN";
}

/** Wait briefly for Auto extraction. Local facts are already saved if this times out. */
export async function waitForMemoryOperation(operationId: string, timeoutMs = 4_000): Promise<string> {
  const started = Date.now();
  let status = "IN_PROGRESS";
  while (Date.now() - started < timeoutMs) {
    status = await memoryOperationStatus(operationId);
    if (status === "COMPLETED" || status === "ERROR") return status;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return status;
}

function stringField(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function normalizeMemory(value: unknown): BackboardMemory | null {
  const row = asRecord(value);
  const content = typeof row.content === "string" ? row.content.trim() : "";
  if (!content) return null;
  const id = stringField(row, "id", "memory_id", "memoryId") ?? content;
  return { id, content };
}
