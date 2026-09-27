"""Stripe tools for the booking agent.

Configure agents/.env (or the environment) with:

    STRIPE_SECRET_KEY=sk_test_...          # or sk_live_...
    STRIPE_PAYMENT_METHOD_ID=              # optional; required to charge live keys in-process
    # STRIPE_API_VERSION=2024-11-20.acacia

Test keys confirm a PaymentIntent with Stripe's test card (pm_card_visa).
Live keys open a Checkout Session unless STRIPE_PAYMENT_METHOD_ID is set.
"""

from __future__ import annotations

import os

import requests

API_KEY = os.getenv("STRIPE_SECRET_KEY", "")
API_VERSION = os.getenv("STRIPE_API_VERSION", "2024-11-20.acacia")
PAYMENT_METHOD = os.getenv("STRIPE_PAYMENT_METHOD_ID", "")
BASE_URL = "https://api.stripe.com/v1"
APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")


class StripeError(RuntimeError):
    """A Stripe API call failed, or the client is missing configuration."""


def _require_key() -> str:
    if not API_KEY.startswith("sk_"):
        raise StripeError("STRIPE_SECRET_KEY is not set")
    return API_KEY


def _can_charge_now() -> bool:
    if API_KEY.startswith("sk_test_"):
        return True
    return bool(PAYMENT_METHOD)


def _call(method: str, path: str, data: dict | None = None) -> dict:
    key = _require_key()
    response = requests.request(
        method,
        f"{BASE_URL}{path}",
        data=data,
        headers={"Stripe-Version": API_VERSION},
        auth=(key, ""),
        timeout=30,
    )
    try:
        payload = response.json()
    except ValueError as error:
        raise StripeError(f"{method} {path} returned non-JSON ({response.status_code})") from error
    if not response.ok:
        message = (payload.get("error") or {}).get("message") or response.text
        raise StripeError(f"{method} {path} -> {response.status_code}: {message}")
    return payload


def fund_treasury(amount_usd: float) -> str:
    """Confirm Stripe can take the booking's charges.

    Stripe settles to the account balance, so there is no prepaid treasury to
    fund. Call this once before pay_merchant and stay within amount_usd.
    """
    _require_key()
    mode = "test" if API_KEY.startswith("sk_test_") else "live"
    return (
        f"Stripe {mode} mode is ready. Charges settle to the account balance. "
        f"Stay within ${amount_usd:,.2f}."
    )


def pay_merchant(
    merchant_name: str,
    merchant_category_code: str,
    amount_usd: float,
    memo: str = "",
) -> dict:
    """Charge a merchant through Stripe for this exact booking.

    Test keys confirm immediately. Live keys return a Checkout URL unless
    STRIPE_PAYMENT_METHOD_ID is set. merchant_category_code is recorded on the
    charge metadata (Stripe does not gate spend by MCC).
    """
    amount_cents = max(50, int(round(amount_usd * 100)))
    note = memo or merchant_category_code
    try:
        if _can_charge_now():
            payment_method = PAYMENT_METHOD or "pm_card_visa"
            intent = _call(
                "POST",
                "/payment_intents",
                {
                    "amount": amount_cents,
                    "currency": "usd",
                    "confirm": "true",
                    "payment_method": payment_method,
                    "payment_method_types[]": "card",
                    "description": merchant_name[:200],
                    "metadata[memo]": note[:400],
                    "metadata[mcc]": merchant_category_code,
                    "expand[]": "latest_charge",
                },
            )
            if intent.get("status") != "succeeded":
                reason = (intent.get("last_payment_error") or {}).get("message") or intent.get("status")
                return {"status": "declined", "merchant": merchant_name, "reason": reason}
            charge = intent.get("latest_charge") or {}
            card = ((charge.get("payment_method_details") or {}).get("card") or {})
            return {
                "status": "paid",
                "receipt": intent["id"],
                "merchant": merchant_name,
                "amount_usd": amount_usd,
                "card_last4": card.get("last4"),
                "memo": memo,
            }

        session = _call(
            "POST",
            "/checkout/sessions",
            {
                "mode": "payment",
                "success_url": f"{APP_URL}/app/money?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
                "cancel_url": f"{APP_URL}/app/money?checkout=cancel",
                "line_items[0][quantity]": 1,
                "line_items[0][price_data][currency]": "usd",
                "line_items[0][price_data][unit_amount]": amount_cents,
                "line_items[0][price_data][product_data][name]": merchant_name[:200],
                "line_items[0][price_data][product_data][description]": note[:400],
                "metadata[merchant]": merchant_name[:200],
                "metadata[memo]": note[:400],
                "metadata[amountUsd]": str(amount_usd),
            },
        )
        return {
            "status": "requires_action",
            "merchant": merchant_name,
            "amount_usd": amount_usd,
            "checkout_url": session.get("url"),
            "receipt": session.get("id"),
            "memo": memo,
        }
    except StripeError as error:
        return {"status": "declined", "merchant": merchant_name, "reason": str(error)}


def purchase_history(limit: int = 20) -> list[dict]:
    """List recent Stripe charges, newest first."""
    payload = _call("GET", f"/charges?limit={min(int(limit), 100)}")
    history = []
    for charge in payload.get("data") or []:
        card = ((charge.get("payment_method_details") or {}).get("card") or {})
        history.append(
            {
                "receipt": charge.get("id"),
                "merchant": charge.get("description") or charge.get("calculated_statement_descriptor"),
                "amount_usd": (charge.get("amount") or 0) / 100,
                "status": charge.get("status"),
                "card_last4": card.get("last4"),
            }
        )
    return history


AGENT_TOOLS = [fund_treasury, pay_merchant, purchase_history]
