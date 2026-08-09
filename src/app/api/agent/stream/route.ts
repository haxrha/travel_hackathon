import { recentTrace, subscribeTrace } from "@/lib/agents/trace";

export const dynamic = "force-dynamic";

/** SSE stream of orchestrator / agent thought traces. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") ?? undefined;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: "hello", events: recentTrace(tripId) });

      const unsub = subscribeTrace((e) => {
        if (tripId && e.tripId && e.tripId !== tripId) return;
        send({ type: "trace", event: e });
      });

      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 15000);

      const close = () => {
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
