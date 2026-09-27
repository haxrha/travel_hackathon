import { serverEnv } from "../server-env";

export type StripeEnv = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  /** Saved card for off-session agent charges. Test mode defaults to pm_card_visa. */
  paymentMethodId: string;
  apiVersion: string;
};

export function getStripeEnv(): StripeEnv {
  return {
    secretKey: serverEnv("STRIPE_SECRET_KEY"),
    publishableKey: serverEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    webhookSecret: serverEnv("STRIPE_WEBHOOK_SECRET"),
    paymentMethodId: serverEnv("STRIPE_PAYMENT_METHOD_ID"),
    apiVersion: serverEnv("STRIPE_API_VERSION") || "2024-11-20.acacia",
  };
}

export function isStripeConfigured(): boolean {
  return getStripeEnv().secretKey.startsWith("sk_");
}

export function isStripeTestMode(): boolean {
  return getStripeEnv().secretKey.startsWith("sk_test_");
}

/** Live keys never auto-charge unless a saved payment method is configured. */
export function canChargeImmediately(): boolean {
  const env = getStripeEnv();
  if (!env.secretKey.startsWith("sk_")) return false;
  if (env.secretKey.startsWith("sk_test_")) return true;
  return Boolean(env.paymentMethodId);
}
