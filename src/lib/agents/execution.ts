import { BaseAgent } from "./base";
import { getBookingProvider, type NormalizedOffer, type BookingResult } from "../tools/providers/booking";
import { demoStore, isMemoryGraph } from "../demo/store";
import { TravelGraph } from "../graph/service";
import { chargeBooking, isStripeConfigured, type StripeChargeResult } from "../stripe/client";
import { recordLedger } from "../stripe/ledger";

/**
 * Execution agent — proposes bookings through PolicyEngine, then books.
 * When Stripe is configured, charges a PaymentIntent (test keys) or opens Checkout (live keys).
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
    stripePayment?: StripeChargeResult;
    checkoutUrl?: string;
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
    let stripePayment: StripeChargeResult | undefined;

    if (isStripeConfigured()) {
      const merchant = offer.title.slice(0, 80) || `${offer.kind} booking`;
      const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      stripePayment = await chargeBooking({
        merchantName: merchant,
        amountUsd: offer.priceUsd,
        memo: `${offer.kind}:${offer.id}`,
        tripId: this.ctx.tripId,
        offerId: offer.id,
        userId: this.ctx.userId,
        successUrl: `${origin}/app/money?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/app/money?checkout=cancel`,
      });

      if (stripePayment.status === "declined") {
        booking = {
          ...booking,
          ok: false,
          status: "FAILED",
          steps: [...booking.steps, "Creating Stripe charge", `Declined: ${stripePayment.reason}`],
          simulated: false,
        };
        recordLedger({
          id: `declined-${offer.id}-${Date.now()}`,
          userId: this.ctx.userId,
          tripId: this.ctx.tripId,
          offerId: offer.id,
          merchant,
          amountUsd: offer.priceUsd,
          status: "failed",
          createdAt: new Date().toISOString(),
        });
        await this.logAction({
          action: "book_stripe_declined",
          tool: "stripe",
          input: { offerId: offer.id, merchant },
          result: stripePayment as any,
          status: "FAILED",
          userAuthorization: approved,
        });
        return { policy, booking, stripePayment };
      }

      if (stripePayment.status === "requires_action") {
        booking = {
          ...booking,
          ok: true,
          confirmationCode: stripePayment.sessionId,
          status: "PENDING",
          simulated: false,
          steps: ["Verifying availability", "Creating Stripe Checkout session", "Waiting for payment"],
          stripe: {
            receipt: stripePayment.sessionId,
            merchant: stripePayment.merchant,
            amountUsd: stripePayment.amountUsd,
            checkoutUrl: stripePayment.checkoutUrl,
            status: "requires_action",
          },
        };
        recordLedger({
          id: stripePayment.sessionId,
          userId: this.ctx.userId,
          tripId: this.ctx.tripId,
          offerId: offer.id,
          merchant: stripePayment.merchant,
          amountUsd: stripePayment.amountUsd,
          status: "pending",
          checkoutUrl: stripePayment.checkoutUrl,
          createdAt: new Date().toISOString(),
        });
      } else {
        booking = {
          ...booking,
          ok: true,
          confirmationCode: stripePayment.receipt,
          status: "CONFIRMED",
          simulated: false,
          steps: [
            "Verifying availability",
            "Creating Stripe PaymentIntent",
            "Confirming card charge",
            "Updating Travel Graph",
          ],
          stripe: {
            receipt: stripePayment.receipt,
            cardLast4: stripePayment.cardLast4,
            merchant: stripePayment.merchant,
            amountUsd: stripePayment.amountUsd,
            status: "paid",
          },
        };
        recordLedger({
          id: stripePayment.receipt,
          userId: this.ctx.userId,
          tripId: this.ctx.tripId,
          offerId: offer.id,
          merchant: stripePayment.merchant,
          amountUsd: stripePayment.amountUsd,
          status: "paid",
          cardLast4: stripePayment.cardLast4,
          paymentIntentId: stripePayment.paymentIntentId,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const paid = booking.stripe?.status === "paid";
    const awaitingCheckout = booking.stripe?.status === "requires_action";

    if (this.ctx.tripId && isMemoryGraph()) {
      demoStore.addItem(this.ctx.tripId, {
        kind: offer.kind === "hotel" ? "HOTEL" : offer.kind === "flight" ? "FLIGHT" : offer.kind === "restaurant" ? "RESTAURANT" : "EXPERIENCE",
        title: offer.title,
        status: paid ? "CONFIRMED" : awaitingCheckout ? "HELD" : "CONFIRMED",
        location: offer.location,
        payload: {
          priceUsd: offer.priceUsd,
          confirmationCode: booking.confirmationCode,
          provider: offer.provider,
          simulated: booking.simulated,
          stripe: booking.stripe,
          stripeSessionId: awaitingCheckout ? booking.stripe?.receipt : undefined,
          effective: offer.effective,
          description: paid
            ? `Paid via Stripe · ${booking.stripe?.cardLast4 ? `****${booking.stripe.cardLast4} · ` : ""}${booking.confirmationCode}`
            : awaitingCheckout
              ? `Stripe Checkout open · ${booking.confirmationCode}`
              : `Booked via WAYPORT · ${booking.confirmationCode}`,
          whatToDo: ["Save confirmation to Wallet", "Add to calendar", "Check cancellation window"],
        },
      });
      demoStore.logAction({
        userId: this.ctx.userId,
        tripId: this.ctx.tripId,
        agent: "BOOKING",
        tool: booking.stripe ? "stripe" : "mock_booking",
        action: "book_confirmed",
        input: { offerId: offer.id },
        result: {
          confirmationCode: booking.confirmationCode,
          stripe: booking.stripe,
        },
        status: "EXECUTED",
      });
      demoStore.addAlert(this.ctx.tripId, {
        title: `${awaitingCheckout ? "Checkout" : "Booked"} · ${offer.title}`,
        body: paid
          ? `Stripe receipt ${booking.confirmationCode}${booking.stripe?.cardLast4 ? ` · card ****${booking.stripe.cardLast4}` : ""}. Graph updated.`
          : awaitingCheckout
            ? `Stripe Checkout ${booking.confirmationCode} is waiting for payment.`
            : `Confirmation ${booking.confirmationCode} (simulated transaction). Graph updated.`,
        severity: "INFO",
      });
    } else if (this.ctx.tripId) {
      await new TravelGraph(this.ctx.userId).addItem(this.ctx.tripId, {
        kind: (offer.kind === "hotel" ? "HOTEL" : "CUSTOM") as any,
        title: offer.title,
        status: (paid || !awaitingCheckout ? "CONFIRMED" : "TENTATIVE") as "CONFIRMED" | "TENTATIVE",
        confirmationCode: booking.confirmationCode,
        payload: {
          priceUsd: offer.priceUsd,
          simulated: booking.simulated,
          stripe: booking.stripe,
          stripeSessionId: awaitingCheckout ? booking.stripe?.receipt : undefined,
        },
      });
    }

    await this.logAction({
      action: "book_executed",
      tool: booking.stripe ? "stripe" : "booking_provider",
      input: { offerId: offer.id },
      result: booking as any,
      status: "EXECUTED",
      userAuthorization: approved,
    });

    return {
      policy,
      booking,
      stripePayment,
      checkoutUrl: stripePayment?.status === "requires_action" ? stripePayment.checkoutUrl : undefined,
    };
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
