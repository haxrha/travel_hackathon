import { BaseAgent } from "./base";
import { getBookingProvider, type NormalizedOffer, type BookingResult } from "../tools/providers/booking";
import { demoStore, isMemoryGraph } from "../demo/store";
import { TravelGraph } from "../graph/service";
import {
  fundTreasury,
  isRainConfigured,
  mccForOfferKind,
  payMerchant,
  type PayMerchantResult,
} from "../rain";

/**
 * Execution agent — proposes bookings through PolicyEngine, then books.
 * When Rain env is configured, charges a single-use scoped card; otherwise mock-books.
 */
export class ExecutionAgent extends BaseAgent {
  kind = "EXECUTOR" as const;

  async proposeBook(offer: NormalizedOffer) {
    const decision = this.check({
      agent: "BOOKING",
      tool: "booking_provider",
      action: "book",
      amountUsd: offer.priceUsd,
      isBooking: true,
      isFinancial: true,
      metadata: { category: offer.kind === "flight" ? "flight" : offer.kind === "hotel" ? "hotel" : "other" },
    });
    await this.logAction({
      action: "propose_book",
      tool: "policy",
      input: { offerId: offer.id, priceUsd: offer.priceUsd },
      decision: decision as any,
      status: decision.requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
    });
    return decision;
  }

  async confirmBook(offer: NormalizedOffer, approved = false): Promise<{
    policy: ReturnType<ExecutionAgent["check"]>;
    booking?: BookingResult;
    blocked?: boolean;
    rainPayment?: PayMerchantResult;
  }> {
    const policy = await this.proposeBook(offer);
    if (policy.requiresApproval && !approved) {
      return { policy, blocked: true };
    }
    if (!policy.allowed && !approved) {
      return { policy, blocked: true };
    }

    const provider = getBookingProvider();
    let booking = await provider.book(offer);
    let rainPayment: PayMerchantResult | undefined;

    if (isRainConfigured()) {
      const merchant = offer.title.slice(0, 40) || `${offer.kind} booking`;
      const mcc = mccForOfferKind(offer.kind);
      await fundTreasury(offer.priceUsd + 1);
      rainPayment = await payMerchant({
        merchantName: merchant,
        merchantCategoryCode: mcc,
        amountUsd: offer.priceUsd,
        memo: `${offer.kind}:${offer.id}`,
      });

      if (rainPayment.status === "declined") {
        booking = {
          ...booking,
          ok: false,
          status: "FAILED",
          steps: [
            ...booking.steps,
            "Charging Rain scoped card",
            `Declined: ${rainPayment.reason}`,
          ],
          simulated: false,
        };
        await this.logAction({
          action: "book_rain_declined",
          tool: "rain",
          input: { offerId: offer.id, merchant, mcc },
          result: rainPayment as any,
          status: "FAILED",
          userAuthorization: approved,
        });
        return { policy, booking, rainPayment };
      }

      booking = {
        ...booking,
        ok: true,
        confirmationCode: rainPayment.receipt,
        status: "CONFIRMED",
        simulated: false,
        steps: [
          "Verifying availability",
          "Funding Rain treasury",
          "Issuing single-use scoped card",
          "Authorizing & settling charge",
          "Updating Travel Graph",
        ],
        rain: {
          receipt: rainPayment.receipt,
          cardLast4: rainPayment.card_last4,
          merchant: rainPayment.merchant,
          amountUsd: rainPayment.amount_usd,
        },
      };
    }

    const usedRain = Boolean(booking.rain);

    if (this.ctx.tripId && isMemoryGraph()) {
      demoStore.addItem(this.ctx.tripId, {
        kind: offer.kind === "hotel" ? "HOTEL" : offer.kind === "flight" ? "FLIGHT" : offer.kind === "restaurant" ? "RESTAURANT" : "EXPERIENCE",
        title: offer.title,
        status: "CONFIRMED",
        location: offer.location,
        payload: {
          priceUsd: offer.priceUsd,
          confirmationCode: booking.confirmationCode,
          provider: offer.provider,
          simulated: booking.simulated,
          rain: booking.rain,
          effective: offer.effective,
          description: usedRain
            ? `Paid via Rain · ****${booking.rain!.cardLast4} · ${booking.confirmationCode}`
            : `Booked via WAYPORT · ${booking.confirmationCode}`,
          whatToDo: ["Save confirmation to Wallet", "Add to calendar", "Check cancellation window"],
        },
      });
      demoStore.logAction({
        userId: this.ctx.userId,
        tripId: this.ctx.tripId,
        agent: "BOOKING",
        tool: usedRain ? "rain" : "mock_booking",
        action: "book_confirmed",
        input: { offerId: offer.id },
        result: {
          confirmationCode: booking.confirmationCode,
          rain: booking.rain,
        },
        status: "EXECUTED",
      });
      demoStore.addAlert(this.ctx.tripId, {
        title: `Booked · ${offer.title}`,
        body: usedRain
          ? `Rain receipt ${booking.confirmationCode} · card ****${booking.rain!.cardLast4}. Graph updated.`
          : `Confirmation ${booking.confirmationCode} (simulated transaction). Graph updated.`,
        severity: "INFO",
      });
    } else if (this.ctx.tripId) {
      await new TravelGraph(this.ctx.userId).addItem(this.ctx.tripId, {
        kind: (offer.kind === "hotel" ? "HOTEL" : "CUSTOM") as any,
        title: offer.title,
        status: "CONFIRMED",
        confirmationCode: booking.confirmationCode,
        payload: {
          priceUsd: offer.priceUsd,
          simulated: booking.simulated,
          rain: booking.rain,
        },
      });
    }

    await this.logAction({
      action: "book_executed",
      tool: usedRain ? "rain" : "booking_provider",
      input: { offerId: offer.id },
      result: booking as any,
      status: "EXECUTED",
      userAuthorization: approved,
    });

    return { policy, booking, rainPayment };
  }

  async searchAndRank(kind: "hotel" | "flight" | "experience" | "restaurant", params: Record<string, unknown>) {
    const provider = getBookingProvider();
    const offers = await provider.search(kind, params);
    await this.logAction({
      action: `search_${kind}`,
      tool: "booking_provider",
      input: params as any,
      result: { count: offers.length } as any,
    });
    return offers.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.priceUsd - b.priceUsd);
  }
}
