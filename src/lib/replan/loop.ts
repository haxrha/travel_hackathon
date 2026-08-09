import { prisma } from "@/server/db/client";
import { emitEvent, getPendingEvents, markProcessed } from "../events/bus";
import { orchestrator, defaultAutonomy } from "../agents/orchestrator";
import { PriceMonitorAgent } from "../agents/priceMonitor";

/**
 * Replanning Loop — runs whenever the world changes.
 * Event → graph update → constraint check → agent reasoning → re-optimize → notify.
 */
export async function runReplanningLoop(userId: string, tripId: string) {
  const pending = await getPendingEvents(tripId, 25);
  if (pending.length === 0) return { processed: 0 };

  const orch = orchestrator(userId, tripId, defaultAutonomy());
  for (const ev of pending) {
    switch (ev.type) {
      case "FLIGHT_DELAYED":
      case "WEATHER_CHANGED":
      case "RESERVATION_CANCELLED":
      case "HOTEL_PRICE_CHANGED":
      case "USER_PREFERENCE_CHANGED": {
        await orch.handleEvent(ev.type, ev.payload as any);
        break;
      }
      case "BOOKING_CONFIRMED": {
        await new PriceMonitorAgent({ userId, tripId, autonomy: defaultAutonomy() }).checkHotelDrops();
        break;
      }
      default: {
        await emitEvent(tripId, "ITINERARY_UPDATED", { reason: ev.type });
      }
    }
  }

  await markProcessed(pending.map((e) => e.id));
  return { processed: pending.length };
}
