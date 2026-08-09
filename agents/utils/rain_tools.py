"""Rain sandbox tools: fund collateral, issue a scoped card, spend on it, move money.

Sandbox only — https://api-dev.raincards.xyz/v1. Configure with a `.env` holding
RAIN_API_KEY, RAIN_USER_ID, RAIN_CONTRACT_ID (and optionally RAIN_BASE_URL).

Run the whole quickstart end to end:  uv run python -m utils.rain_tools
"""

from __future__ import annotations

import base64
import os
import uuid
from pathlib import Path
from typing import Any

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv

load_dotenv(Path(__file__).parents[1] / ".env")  # agents/.env, whatever the cwd is

BASE_URL = os.getenv("RAIN_BASE_URL", "https://api-dev.raincards.xyz/v1").rstrip("/")
API_KEY = os.getenv("RAIN_API_KEY", "c7f3672e9b88f1b69ef42f2a7ddf81f4a6a10cf1")
USER_ID = os.getenv("RAIN_USER_ID", "7eeea853-ca13-4540-bf58-0e2c686a52dd")
CONTRACT_ID = os.getenv("RAIN_CONTRACT_ID", "ee4df870-e3ec-4151-8144-7985eab60ccf")

# Encrypts the `sessionid` header on scoped-card requests. Sandbox key, published at
# https://rain-sandbox-trial.mintlify.site/docs/resource-sessionid-keys
SANDBOX_PUBLIC_KEY = b"""-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCAP192809jZyaw62g/eTzJ3P9H
+RmT88sXUYjQ0K8Bx+rJ83f22+9isKx+lo5UuV8tvOlKwvdDS/pVbzpG7D7NO45c
0zkLOXwDHZkou8fuj8xhDO5Tq3GzcrabNLRLVz3dkx0znfzGOhnY4lkOMIdKxlQb
LuVM/dGDC9UpulF+UwIDAQAB
-----END PUBLIC KEY-----"""

TIMEOUT = 30
_session = requests.Session()


class RainError(RuntimeError):
    """A Rain API call failed, or the client is missing configuration."""


def _call(method: str, path: str, **kwargs: Any) -> Any:
    if not API_KEY:
        raise RainError("RAIN_API_KEY is not set")
    headers = {"Api-Key": API_KEY, **kwargs.pop("headers", {})}
    response = _session.request(
        method, f"{BASE_URL}{path}", headers=headers, timeout=TIMEOUT, **kwargs
    )
    if not response.ok:
        raise RainError(f"{method} {path} -> {response.status_code}: {response.text}")
    return response.json() if response.content else {}


def _require(value: str, name: str) -> str:
    if not value:
        raise RainError(f"{name} is not set")
    return value


# --- 1. Collateral -----------------------------------------------------------


def fund_collateral(amount_cents: int, contract_id: str | None = None) -> dict:
    """Add sandbox collateral, which is what cards spend against.

    amount_cents is USD minor units (100000 = $1,000.00).
    """
    return _call(
        "POST",
        "/simulate/collateral/fund",
        json={
            "contractId": _require(contract_id or CONTRACT_ID, "RAIN_CONTRACT_ID"),
            "currency": "rusd",
            "amount": amount_cents,
        },
    )


# --- 2. Scoped cards ---------------------------------------------------------


def _new_session_id() -> tuple[str, bytes]:
    """Return (sessionid header, AES key) — the key decrypts that card's PAN and CVC."""
    key = uuid.uuid4().bytes  # the 32-hex-char secret the docs ask for, as raw bytes
    public_key = serialization.load_pem_public_key(SANDBOX_PUBLIC_KEY)
    session_id = public_key.encrypt(
        base64.b64encode(key),
        padding.OAEP(mgf=padding.MGF1(hashes.SHA1()), algorithm=hashes.SHA1(), label=None),
    )
    return base64.b64encode(session_id).decode(), key


def _decrypt(field: dict[str, str], key: bytes) -> str:
    """Decrypt an {iv, data} pair from a scoped-card response (AES-128-GCM)."""
    plaintext = AESGCM(key).decrypt(
        base64.b64decode(field["iv"]), base64.b64decode(field["data"]), None
    )
    return plaintext.decode().strip()


def issue_scoped_card(
    amount_in_usd_cents: int,
    allowed_mccs: list[str] | None = None,
    user_id: str | None = None,
) -> dict:
    """Issue a virtual card that can only spend up to amount_in_usd_cents, once.

    Pass allowed_mccs (e.g. ["3501", "4511"]) to also scope it to merchant categories.
    Returns the card id, decrypted pan/cvc, expiry, last4 and status.
    """
    body: dict[str, Any] = {"amountInUSDCents": amount_in_usd_cents}
    if allowed_mccs:
        body["allowedMccs"] = allowed_mccs

    session_id, key = _new_session_id()
    card = _call(
        "POST",
        f"/issuing/users/{_require(user_id or USER_ID, 'RAIN_USER_ID')}/cards/scoped",
        headers={"sessionid": session_id},
        json=body,
    )
    return {
        "id": card["id"],
        "pan": _decrypt(card["encryptedPan"], key),
        "cvc": _decrypt(card["encryptedCvc"], key),
        "expirationMonth": card["expirationMonth"],
        "expirationYear": card["expirationYear"],
        "last4": card["last4"],
        "status": card["status"],
    }


# --- 3. Transactions ---------------------------------------------------------


def authorize_transaction(
    card_id: str,
    amount_cents: int,
    merchant_name: str,
    merchant_category_code: str,
    decline_reason: str | None = None,
) -> dict:
    """Simulate a merchant authorizing amount_cents on a card.

    Pass decline_reason (e.g. "blocked_mcc", "account_credit_limit_exceeded") to
    simulate a decline instead. Returns the transaction, including transactionId.
    """
    body: dict[str, Any] = {
        "cardId": card_id,
        "amount": amount_cents,
        "currency": "USD",
        "merchantName": merchant_name,
        "merchantCategoryCode": merchant_category_code,
    }
    if decline_reason:
        body["declineReason"] = decline_reason
    return _call("POST", "/simulate/transactions/authorize", json=body)


def settle_transaction(transaction_id: str, amount_cents: int) -> dict:
    """Settle an authorized transaction — pass the authorized amount, or less."""
    return _call(
        "POST",
        f"/simulate/transactions/{transaction_id}/settle",
        json={"amount": amount_cents},
    )


def list_transactions(limit: int = 20, card_id: str | None = None) -> list[dict]:
    """Read transactions back, newest first."""
    params: dict[str, Any] = {"limit": limit}
    if card_id:
        params["cardId"] = card_id
    return _call("GET", "/issuing/transactions", params=params)


# --- 4. Payment routes -------------------------------------------------------


def create_payment_route(source: dict, destination: dict, user_id: str | None = None) -> dict:
    """Create a standing route that converts money between rails on arrival.

    source: {"currency": "usd", "rail": "ach"|"wire"} or {"currency": "usdc"|"rusd", "rail": "base"|"solana"|...}
    destination: a crypto rail plus {"address": {"type": "onchain", "address": "0x..."}},
        or a fiat rail plus {"address": {"type": "paymentAccount", "id": "<uuid>"}}
    """
    return _call(
        "POST",
        "/payment-routes",
        json={
            "userId": _require(user_id or USER_ID, "RAIN_USER_ID"),
            "source": source,
            "destination": destination,
        },
    )


def list_payment_routes() -> list[dict]:
    """List existing payment routes. Creating a duplicate route is rejected, so check here first."""
    return _call("GET", "/payment-routes")["paymentRoutes"]


def simulate_payment_route(payment_route_id: str, amount: float | str) -> dict:
    """Push a deposit through a payment route. amount is whole units (max 100 per call)."""
    return _call(
        "POST",
        "/simulate/payment-routes",
        json={"paymentRouteId": payment_route_id, "amount": str(amount)},
    )


RAIN_TOOLS = [
    fund_collateral,
    issue_scoped_card,
    authorize_transaction,
    settle_transaction,
    list_transactions,
    create_payment_route,
    list_payment_routes,
    simulate_payment_route,
]


# --- 5. What a spending agent sees -------------------------------------------
# Deliberately framed as a real company card: real-world names, dollars instead of
# cents, no mention of the sandbox. The agent should behave as if the money is real.
#
# Each purchase burns one scoped card, and Rain caps a user at 10 new cards per 24h
# (and $5,000 approved spend), so budget roughly ten purchases a day across all runs.


def fund_treasury(amount_usd: float) -> str:
    """Move money from the company account onto the card program's balance.

    Cards spend against this balance, so top it up before buying anything.
    """
    fund_collateral(int(round(amount_usd * 100)))
    return f"Treasury topped up by ${amount_usd:,.2f}."


def pay_merchant(
    merchant_name: str,
    merchant_category_code: str,
    amount_usd: float,
    memo: str = "",
) -> dict:
    """Pay a merchant with a single-use virtual card locked to this exact purchase.

    The card is issued for amount_usd only, restricted to merchant_category_code,
    charged, and never used again. The money leaves the treasury immediately and
    there is no undo, so check the price before calling.

    merchant_category_code is the 4-digit MCC: 5812 restaurants, 5943 office
    supplies, 5732 electronics, 5691 clothing, 4511 airlines, 7011 hotels,
    5999 other retail.
    """
    amount_cents = int(round(amount_usd * 100))
    try:
        card = issue_scoped_card(amount_cents, allowed_mccs=[merchant_category_code])
        authorization = authorize_transaction(
            card["id"], amount_cents, merchant_name, merchant_category_code
        )
        settle_transaction(authorization["transactionId"], amount_cents)
    except RainError as error:
        return {"status": "declined", "merchant": merchant_name, "reason": str(error)}
    return {
        "status": "paid",
        "receipt": authorization["transactionId"],
        "merchant": merchant_name,
        "amount_usd": amount_usd,
        "card_last4": card["last4"],
        "memo": memo,
    }


def purchase_history(limit: int = 20) -> list[dict]:
    """List the card payments made so far, newest first."""
    history = []
    for transaction in list_transactions(limit=limit):
        if transaction.get("type") != "spend":
            continue  # collateral funding, fees, transfers — not purchases
        spend = transaction["spend"]
        history.append(
            {
                "receipt": transaction["id"],
                # sandbox returns merchantName; production also enriches it
                "merchant": spend.get("merchantName") or spend.get("enrichedMerchantName"),
                "amount_usd": (spend.get("amount") or 0) / 100,
                "status": spend.get("status"),
            }
        )
    return history


AGENT_TOOLS = [fund_treasury, pay_merchant, purchase_history]


if __name__ == "__main__":
    print("1. fund collateral:", fund_collateral(100_000))

    card = issue_scoped_card(4299)
    print(f"2. scoped card: {card['id']} ****{card['last4']} exp {card['expirationMonth']}/{card['expirationYear']}")

    authorization = authorize_transaction(card["id"], 4299, "Demo Store", "5999")
    transaction_id = authorization["transactionId"]
    print("3. authorized:", transaction_id)
    print("   settled:", settle_transaction(transaction_id, 4299))

    print("4. transactions:")
    for transaction in list_transactions(limit=5):
        spend = transaction.get("spend", {})
        print("   ", transaction["id"], spend.get("status"), spend.get("amount"), spend.get("merchantName"))

    source = {"currency": "usd", "rail": "ach"}
    destination = {
        "currency": "usdc",
        "rail": "base",
        "address": {"type": "onchain", "address": "0x742d35Cc6634C0532925a3b844Bc029e4e6C8bBd"},
    }
    route = next(
        (r for r in list_payment_routes() if r["source"] == source and r["destination"] == destination),
        None,
    ) or create_payment_route(source, destination)
    print("5. payment route:", route["id"])
    print("   simulated:", simulate_payment_route(route["id"], 50))
