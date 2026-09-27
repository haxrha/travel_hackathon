/**
 * Stripe payments for WAYPORT bookings.
 *
 * Test keys (sk_test_) confirm a PaymentIntent with pm_card_visa so the
 * booking button charges immediately, the way the Rain sandbox did.
 * Live keys open a Checkout Session unless STRIPE_PAYMENT_METHOD_ID is set.
 */

import { canChargeImmediately, getStripeEnv, isStripeConfigured, isStripeTestMode } from "./env";

const TIMEOUT_MS = 20_000;

export class StripeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeError";
  }
}

export type StripeChargeResult =
  | {
      status: "paid";
      receipt: string;
      merchant: string;
      amountUsd: number;
      cardLast4?: string;
      paymentIntentId: string;
    }
  | {
      status: "requires_action";
      merchant: string;
      amountUsd: number;
      checkoutUrl: string;
      sessionId: string;
    }
  | {
      status: "declined";
      merchant: string;
      reason: string;
    };

type StripeObject = Record<string, unknown>;

function encodeForm(fields: Array<[string, string | number | boolean]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of fields) params.append(key, String(value));
  return params.toString();
}

async function stripeFetch(path: string, init: { method?: string; body?: string } = {}): Promise<unknown> {
  const { secretKey, apiVersion } = getStripeEnv();
  if (!secretKey) throw new StripeError("STRIPE_SECRET_KEY is not set");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": apiVersion,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new StripeError(`${path} returned non-JSON (${response.status})`);
    }
  }
  if (!response.ok) {
    const err = data as { error?: { message?: string } };
    throw new StripeError(err.error?.message || `${path} -> ${response.status}`);
  }
  return data;
}

function asRecord(value: unknown): StripeObject {
  return value && typeof value === "object" ? (value as StripeObject) : {};
}

export async function chargeBooking(input: {
  merchantName: string;
  amountUsd: number;
  memo?: string;
  tripId?: string;
  offerId?: string;
  userId?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeChargeResult> {
  if (!isStripeConfigured()) {
    return { status: "declined", merchant: input.merchantName, reason: "STRIPE_SECRET_KEY is not set" };
  }
  const amountCents = Math.max(50, Math.round(input.amountUsd * 100));
  if (canChargeImmediately()) {
    return confirmPaymentIntent({ ...input, amountCents });
  }
  return createCheckout({ ...input, amountCents });
}

async function confirmPaymentIntent(
  input: {
    merchantName: string;
    amountUsd: number;
    memo?: string;
    tripId?: string;
    offerId?: string;
    userId?: string;
  } & { amountCents: number },
): Promise<StripeChargeResult> {
  const paymentMethod = getStripeEnv().paymentMethodId || (isStripeTestMode() ? "pm_card_visa" : "");
  try {
    const intent = asRecord(
      await stripeFetch("/payment_intents", {
        method: "POST",
        body: encodeForm([
          ["amount", input.amountCents],
          ["currency", "usd"],
          ["confirm", true],
          ["payment_method", paymentMethod],
          ["payment_method_types[]", "card"],
          ["description", input.merchantName.slice(0, 200)],
          ["metadata[tripId]", input.tripId ?? ""],
          ["metadata[offerId]", input.offerId ?? ""],
          ["metadata[userId]", input.userId ?? ""],
          ["metadata[merchant]", input.merchantName.slice(0, 200)],
          ["metadata[memo]", (input.memo ?? "").slice(0, 400)],
          ["expand[]", "latest_charge"],
        ]),
      }),
    );
    const status = typeof intent.status === "string" ? intent.status : "";
    if (status !== "succeeded") {
      const lastError = asRecord(intent.last_payment_error);
      return {
        status: "declined",
        merchant: input.merchantName,
        reason: typeof lastError.message === "string" ? lastError.message : `PaymentIntent ${status || "failed"}`,
      };
    }
    const charge = asRecord(intent.latest_charge);
    const card = asRecord(asRecord(charge.payment_method_details).card);
    return {
      status: "paid",
      receipt: typeof intent.id === "string" ? intent.id : "stripe",
      merchant: input.merchantName,
      amountUsd: input.amountUsd,
      cardLast4: typeof card.last4 === "string" ? card.last4 : undefined,
      paymentIntentId: typeof intent.id === "string" ? intent.id : "",
    };
  } catch (error) {
    return {
      status: "declined",
      merchant: input.merchantName,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function createCheckout(
  input: {
    merchantName: string;
    amountUsd: number;
    memo?: string;
    tripId?: string;
    offerId?: string;
    userId?: string;
    successUrl: string;
    cancelUrl: string;
  } & { amountCents: number },
): Promise<StripeChargeResult> {
  try {
    const session = asRecord(
      await stripeFetch("/checkout/sessions", {
        method: "POST",
        body: encodeForm([
          ["mode", "payment"],
          ["success_url", input.successUrl],
          ["cancel_url", input.cancelUrl],
          ["client_reference_id", input.tripId ?? input.offerId ?? "wayport"],
          ["line_items[0][quantity]", 1],
          ["line_items[0][price_data][currency]", "usd"],
          ["line_items[0][price_data][unit_amount]", input.amountCents],
          ["line_items[0][price_data][product_data][name]", input.merchantName.slice(0, 200)],
          ["line_items[0][price_data][product_data][description]", (input.memo ?? "WAYPORT booking").slice(0, 400)],
          ["metadata[tripId]", input.tripId ?? ""],
          ["metadata[offerId]", input.offerId ?? ""],
          ["metadata[userId]", input.userId ?? ""],
          ["metadata[merchant]", input.merchantName.slice(0, 200)],
          ["metadata[amountUsd]", String(input.amountUsd)],
        ]),
      }),
    );
    const url = typeof session.url === "string" ? session.url : "";
    const sessionId = typeof session.id === "string" ? session.id : "";
    if (!url || !sessionId) {
      return { status: "declined", merchant: input.merchantName, reason: "Stripe Checkout did not return a URL" };
    }
    return {
      status: "requires_action",
      merchant: input.merchantName,
      amountUsd: input.amountUsd,
      checkoutUrl: url,
      sessionId,
    };
  } catch (error) {
    return {
      status: "declined",
      merchant: input.merchantName,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export type StripePurchase = {
  receipt: string;
  merchant: string;
  amountUsd: number;
  status: string;
  cardLast4?: string;
};

export async function listStripeCharges(limit = 20): Promise<StripePurchase[]> {
  const data = asRecord(await stripeFetch(`/charges?limit=${Math.min(limit, 100)}`));
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.map((row) => {
    const charge = asRecord(row);
    const card = asRecord(asRecord(charge.payment_method_details).card);
    const amount = typeof charge.amount === "number" ? charge.amount : 0;
    return {
      receipt: typeof charge.id === "string" ? charge.id : "",
      merchant:
        (typeof charge.description === "string" && charge.description) ||
        (typeof charge.calculated_statement_descriptor === "string" && charge.calculated_statement_descriptor) ||
        "Stripe charge",
      amountUsd: amount / 100,
      status: typeof charge.status === "string" ? charge.status : "unknown",
      cardLast4: typeof card.last4 === "string" ? card.last4 : undefined,
    };
  });
}

export async function retrieveCheckoutSession(sessionId: string) {
  const session = asRecord(await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`));
  const metadata = asRecord(session.metadata);
  return {
    id: typeof session.id === "string" ? session.id : sessionId,
    paymentStatus: typeof session.payment_status === "string" ? session.payment_status : "",
    amountUsd: typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
    metadata: {
      tripId: typeof metadata.tripId === "string" ? metadata.tripId : undefined,
      offerId: typeof metadata.offerId === "string" ? metadata.offerId : undefined,
      userId: typeof metadata.userId === "string" ? metadata.userId : undefined,
      merchant: typeof metadata.merchant === "string" ? metadata.merchant : undefined,
    },
  };
}

export { isStripeConfigured, isStripeTestMode, canChargeImmediately };
