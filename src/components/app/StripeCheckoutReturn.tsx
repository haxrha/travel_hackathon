"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function StripeCheckoutReturn() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const canceled = params.get("checkout") === "cancel";
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (canceled || !sessionId) return;
    let cancelled = false;
    fetch("/api/stripe/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.payment?.status === "paid") {
          setMessage(`Stripe payment received · ${data.payment.merchant} · ${sessionId}`);
        } else if (data.error) {
          setMessage(data.error);
        } else {
          setMessage("Checkout returned, but Stripe has not marked the payment paid yet.");
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Could not confirm the Stripe session.");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, canceled]);

  const shown = canceled
    ? "Stripe Checkout was canceled. The booking stays unpaid."
    : message;
  if (!shown) return null;
  return (
    <div className="rounded-2xl border border-ember/30 bg-ember/10 px-5 py-4 text-sm text-text-secondary">
      {shown}
    </div>
  );
}
