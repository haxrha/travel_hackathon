"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { NormalizedOffer } from "@/lib/tools/providers/booking";

export default function BookingReview({
  tripId,
  offer: initial,
  onBooked,
}: {
  tripId: string;
  offer: NormalizedOffer;
  onBooked?: (confirmationCode: string) => void;
}) {
  const [offer] = useState(initial);
  const [phase, setPhase] = useState<"review" | "booking" | "done" | "need_approval" | "failed" | "checkout">("review");
  const [steps, setSteps] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [policyReason, setPolicyReason] = useState<string | null>(null);
  const [stripeState, setStripeState] = useState<{ configured: boolean; testMode: boolean } | null>(null);
  const [stripeInfo, setStripeInfo] = useState<{
    receipt: string;
    cardLast4?: string;
    merchant: string;
    amountUsd: number;
    checkoutUrl?: string;
    status: "paid" | "requires_action";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "history", limit: 1 }),
    })
      .then((r) => r.json())
      .then((data) => setStripeState(data.stripe ?? { configured: false, testMode: false }))
      .catch(() => setStripeState({ configured: false, testMode: false }));
  }, []);

  async function book(approved = false) {
    setPhase("booking");
    setSteps(["Reviewing policy…"]);
    setError(null);
    const res = await fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "book", tripId, offer, approved }),
    });
    const data = await res.json();
    if (data.stripe) setStripeState(data.stripe);
    if (data.blocked) {
      setPolicyReason(data.policy?.reason ?? "Needs your approval");
      setPhase("need_approval");
      return;
    }
    if (data.booking?.status === "FAILED" || data.booking?.ok === false) {
      const staged = (data.booking.steps as string[]) ?? [];
      setSteps(staged.map((s) => `• ${s}`));
      setError(data.stripePayment?.reason ?? "Payment failed");
      setPhase("failed");
      return;
    }
    if (data.checkoutUrl) {
      setStripeInfo(data.booking?.stripe ?? null);
      setConfirmation(data.booking?.confirmationCode ?? null);
      setPhase("checkout");
      window.location.href = data.checkoutUrl;
      return;
    }
    if (data.booking) {
      const staged = data.booking.steps as string[];
      for (let i = 0; i < staged.length; i++) {
        await new Promise((r) => setTimeout(r, 280));
        setSteps(staged.slice(0, i + 1).map((s) => `✓ ${s}`));
      }
      setConfirmation(data.booking.confirmationCode);
      setStripeInfo(data.booking.stripe ?? null);
      setPhase("done");
      onBooked?.(data.booking.confirmationCode);
    }
  }

  const stripeLine =
    stripeState === null
      ? "… checking Stripe configuration"
      : stripeState.configured
        ? stripeState.testMode
          ? "✓ Stripe test mode — confirm charges pm_card_visa"
          : "✓ Stripe live — confirm opens Checkout"
        : "○ Stripe not configured — booking stays simulated (set STRIPE_SECRET_KEY)";

  return (
    <div className="wp-card rounded-2xl p-6 space-y-4">
      <div className="wp-eyebrow">Review booking</div>
      <h3 className="font-display text-2xl">{offer.title}</h3>
      <p className="text-sm text-text-secondary">{offer.subtitle}</p>
      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <div className="text-text-tertiary text-xs">Cash</div>
          <div className="font-semibold">{formatCurrency(offer.priceUsd)}</div>
        </div>
        <div>
          <div className="text-text-tertiary text-xs">Effective</div>
          <div className="font-semibold text-ember">
            {offer.effective ? formatCurrency(offer.effective.effectiveUsd) : "—"}
          </div>
        </div>
        <div>
          <div className="text-text-tertiary text-xs">Policy</div>
          <div>{offer.refundable ? "Free cancellation" : "Non-refundable"}</div>
        </div>
      </div>
      <ul className="text-xs text-text-secondary space-y-1">
        <li>✓ Within budget check</li>
        <li>✓ Preference match via DNA / traveler memory</li>
        <li>{stripeLine}</li>
      </ul>

      {phase === "review" && (
        <button onClick={() => book(false)} className="wp-cta px-5 py-2.5 text-sm">
          Confirm booking
        </button>
      )}
      {phase === "need_approval" && (
        <div className="space-y-3">
          <p className="text-sm text-warn">Policy: {policyReason}. Approve to continue.</p>
          <button onClick={() => book(true)} className="wp-cta px-5 py-2.5 text-sm">
            Approve & book
          </button>
        </div>
      )}
      {phase === "booking" && (
        <div className="font-mono text-xs text-text-secondary space-y-1">
          <div className="text-ember">BOOKING {offer.kind.toUpperCase()}</div>
          {steps.map((s) => (
            <div key={s}>{s}</div>
          ))}
        </div>
      )}
      {phase === "checkout" && (
        <div className="rounded-xl border border-ember/30 bg-ember/10 p-4 space-y-2">
          <div className="font-semibold text-ember">OPENING STRIPE CHECKOUT</div>
          <p className="text-xs text-text-secondary">
            Session {confirmation}. Finish payment on Stripe — the Travel Graph updates when Checkout completes.
          </p>
          {stripeInfo?.checkoutUrl && (
            <a href={stripeInfo.checkoutUrl} className="wp-cta inline-flex px-5 py-2.5 text-sm">
              Continue to Stripe
            </a>
          )}
        </div>
      )}
      {phase === "failed" && (
        <div className="rounded-xl border border-ember/30 bg-ember/10 p-4 space-y-2">
          <div className="font-semibold text-ember">PAYMENT FAILED</div>
          <p className="text-xs text-text-secondary">{error}</p>
          <div className="font-mono text-xs text-text-secondary space-y-1">
            {steps.map((s) => (
              <div key={s}>{s}</div>
            ))}
          </div>
          <button onClick={() => book(true)} className="wp-cta px-5 py-2.5 text-sm mt-2">
            Retry
          </button>
        </div>
      )}
      {phase === "done" && confirmation && (
        <div className="rounded-xl border border-ok/30 bg-ok/10 p-4">
          <div className="font-semibold text-ok">{stripeInfo ? "PAID VIA STRIPE" : "BOOKED"}</div>
          <div className="mt-1 font-mono text-sm">
            {stripeInfo ? `Receipt ${confirmation}` : `Confirmation ${confirmation}`}
          </div>
          {stripeInfo && (
            <p className="mt-2 text-xs text-text-secondary">
              {formatCurrency(stripeInfo.amountUsd)} · {stripeInfo.merchant}
              {stripeInfo.cardLast4 ? ` · card ****${stripeInfo.cardLast4}` : ""}
            </p>
          )}
          <p className="mt-2 text-xs text-text-secondary">Travel Graph updated with CONFIRMED node.</p>
        </div>
      )}
    </div>
  );
}
