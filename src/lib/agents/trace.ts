/**
 * In-process agent thought bus for SSE streaming to the UI.
 */

export type TraceEvent = {
  id: string;
  ts: number;
  tripId?: string;
  agent: string;
  step: string;
  detail?: string;
  status?: "running" | "ok" | "warn" | "fail";
};

type Listener = (e: TraceEvent) => void;

const g = globalThis as unknown as { __wpTraceListeners?: Set<Listener>; __wpTraceBuf?: TraceEvent[] };

function listeners() {
  if (!g.__wpTraceListeners) g.__wpTraceListeners = new Set();
  return g.__wpTraceListeners;
}
function buf() {
  if (!g.__wpTraceBuf) g.__wpTraceBuf = [];
  return g.__wpTraceBuf;
}

export function emitTrace(partial: Omit<TraceEvent, "id" | "ts"> & { id?: string; ts?: number }) {
  const e: TraceEvent = {
    id: partial.id ?? `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: partial.ts ?? Date.now(),
    agent: partial.agent,
    step: partial.step,
    detail: partial.detail,
    tripId: partial.tripId,
    status: partial.status ?? "running",
  };
  const b = buf();
  b.push(e);
  if (b.length > 200) b.shift();
  for (const l of listeners()) l(e);
  return e;
}

export function subscribeTrace(fn: Listener) {
  listeners().add(fn);
  return () => listeners().delete(fn);
}

export function recentTrace(tripId?: string, take = 40) {
  const all = buf();
  const filtered = tripId ? all.filter((e) => !e.tripId || e.tripId === tripId) : all;
  return filtered.slice(-take);
}
