import { Suspense } from "react";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { formatCurrency } from "@/lib/utils";
import { getRate } from "@/lib/tools/currency/fx";
import PageAsciiHero from "@/components/app/PageAsciiHero";
import StripeCheckoutReturn from "@/components/app/StripeCheckoutReturn";
import { isStripeConfigured, isStripeTestMode, listStripeCharges } from "@/lib/stripe/client";
import { listLedger } from "@/lib/stripe/ledger";

export default async function MoneyPage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();
  const fx = await getRate("USD", "JPY");

  const rows = trips.map((t: any) => {
    const b = t.budgets?.[0] ?? { totalBudget: 0, actual: 0, remaining: 0, currency: "USD" };
    return { id: t.id, title: t.title, destination: t.destination, ...b };
  });

  const total = rows.reduce((s, r) => s + Number(r.totalBudget), 0);
  const spent = rows.reduce((s, r) => s + Number(r.actual), 0);
  const stripeOn = isStripeConfigured();
  const testMode = isStripeTestMode();
  let charges: { receipt: string; merchant: string; amountUsd: number; status: string; cardLast4?: string }[] = [];
  let chargeError: string | undefined;
  if (stripeOn) {
    try {
      charges = await listStripeCharges(8);
    } catch (e) {
      chargeError = e instanceof Error ? e.message : "Could not list Stripe charges";
      charges = listLedger(userId).map((row) => ({
        receipt: row.id,
        merchant: row.merchant,
        amountUsd: row.amountUsd,
        status: row.status,
        cardLast4: row.cardLast4,
      }));
    }
  } else {
    charges = listLedger(userId).map((row) => ({
      receipt: row.id,
      merchant: row.merchant,
      amountUsd: row.amountUsd,
      status: row.status,
      cardLast4: row.cardLast4,
    }));
  }

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="money"
        eyebrow="You"
        title="Money"
        subtitle="Budgets across the Travel Graph · bookings settle through Stripe."
      />

      <Suspense fallback={null}>
        <StripeCheckoutReturn />
      </Suspense>

      <section className="wp-card space-y-2 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="wp-section-title">Stripe</h2>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-text-secondary">
            {stripeOn ? (testMode ? "Test mode" : "Live") : "Not configured"}
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          {stripeOn
            ? testMode
              ? "Confirm booking charges the Stripe test card (pm_card_visa). Use a live secret key plus STRIPE_WEBHOOK_SECRET to take Checkout in production."
              : "Live charges open Stripe Checkout unless STRIPE_PAYMENT_METHOD_ID is set."
            : "Set STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, and STRIPE_WEBHOOK_SECRET. Bookings stay simulated until the secret key is present."}
        </p>
        {chargeError && <p className="text-xs text-ember">{chargeError}</p>}
        {charges.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {charges.map((charge) => (
              <li key={charge.receipt} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {charge.merchant}
                  {charge.cardLast4 ? ` · ****${charge.cardLast4}` : ""}
                </span>
                <span className="text-text-tertiary">
                  {formatCurrency(charge.amountUsd)} · {charge.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card label="Total planned" value={formatCurrency(total)} />
        <Card label="Spent" value={formatCurrency(spent)} />
        <Card label={`USD → JPY`} value={fx.rate.toFixed(2)} hint="Live/fallback rate" />
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="wp-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
            <div>
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-text-tertiary">{r.destination}</div>
            </div>
            <div className="text-right text-sm">
              <div>{formatCurrency(Number(r.remaining))} left</div>
              <div className="text-xs text-text-tertiary">of {formatCurrency(Number(r.totalBudget))}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="wp-card rounded-2xl p-5">
      <div className="wp-eyebrow">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-text-tertiary">{hint}</div>}
    </div>
  );
}
