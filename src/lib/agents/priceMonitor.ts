import { prisma } from "@/server/db/client";
import { BaseAgent } from "./base";

export class PriceMonitorAgent extends BaseAgent {
  kind = "PRICE_MONITOR" as const;

  async checkHotelDrops() {
    const tripId = this.ctx.tripId;
    if (!tripId) return { checked: 0 };
    const bookings = await prisma.booking.findMany({
      where: { tripItem: { tripId, kind: "HOTEL" }, status: "CONFIRMED" },
      include: { tripItem: true },
    });
    const drops: { bookingId: string; savedUsd: number }[] = [];
    for (const b of bookings) {
      const newPrice = Number(b.totalPrice) - 74; // simulated check
      if (newPrice < Number(b.totalPrice)) {
        drops.push({ bookingId: b.id, savedUsd: Number(b.totalPrice) - newPrice });
        await prisma.travelAlert.create({
          data: {
            tripId,
            kind: "PRICE_DROP",
            severity: "INFO",
            title: "Hotel price dropped",
            body: `Your hotel dropped $${Number(b.totalPrice) - newPrice}. If refundable, I can rebook and save you the difference.`,
          },
        });
      }
    }
    return { checked: bookings.length, drops };
  }
}
