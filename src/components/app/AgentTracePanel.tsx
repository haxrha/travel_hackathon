"use client";

import { useEffect, useState } from "react";
import type { TraceEvent } from "@/lib/agents/trace";
import { cn } from "@/lib/utils";

export default function AgentTracePanel({
  tripId,
  className,
  compact,
}: {
  tripId?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const qs = tripId ? `?tripId=${encodeURIComponent(tripId)}` : "";
    const es = new EventSource(`/api/agent/stream${qs}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "hello" && Array.isArray(data.events)) {
          setEvents(data.events);
        } else if (data.type === "trace" && data.event) {
          setEvents((prev) => [...prev.slice(-48), data.event as TraceEvent]);
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [tripId]);

  return (
    <div className={cn("wp-card rounded-2xl p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="wp-eyebrow">Agent thought stream</div>
        <span className={cn("text-[10px] uppercase tracking-widest", connected ? "text-ok" : "text-text-tertiary")}>
          {connected ? "SSE live" : "connecting"}
        </span>
      </div>
      <ul className={cn("mt-3 space-y-1.5 overflow-y-auto font-mono text-[11px] text-text-secondary", compact ? "max-h-40" : "max-h-64")}>
        {events.length === 0 ? (
          <li className="text-text-tertiary">Waiting for Orchestrator / Guardian…</li>
        ) : (
          events.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span
                className={cn(
                  "shrink-0",
                  e.status === "ok" && "text-ok",
                  e.status === "warn" && "text-ember",
                  e.status === "fail" && "text-red-400",
                  e.status === "running" && "text-text-tertiary",
                )}
              >
                {e.status === "running" ? "●" : e.status === "warn" ? "!" : "✓"}
              </span>
              <span>
                <span className="text-ember">{e.agent}</span> · {e.step}
                {e.detail ? <span className="text-text-tertiary"> — {e.detail}</span> : null}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
