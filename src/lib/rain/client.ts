/**
 * Rain sandbox client — mirrors agents/utils/rain_tools.py agent-facing tools.
 * Sandbox only: https://api-dev.raincards.xyz/v1
 *
 * Configure with RAIN_API_KEY, RAIN_USER_ID, RAIN_CONTRACT_ID in .env.local
 * (or agents/.env — loaded as a fallback for local workshop use).
 */

import { createDecipheriv, publicEncrypt, randomBytes, constants } from "crypto";
import { getRainEnv } from "./env";

function rain() {
  return getRainEnv();
}

/** Sandbox sessionid public key — https://rain-sandbox-trial.mintlify.site/docs/resource-sessionid-keys */
const SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCAP192809jZyaw62g/eTzJ3P9H
+RmT88sXUYjQ0K8Bx+rJ83f22+9isKx+lo5UuV8tvOlKwvdDS/pVbzpG7D7NO45c
0zkLOXwDHZkou8fuj8xhDO5Tq3GzcrabNLRLVz3dkx0znfzGOhnY4lkOMIdKxlQb
LuVM/dGDC9UpulF+UwIDAQAB
-----END PUBLIC KEY-----`;

const TIMEOUT_MS = 30_000;

export class RainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RainError";
  }
}

export function isRainConfigured(): boolean {
  const { apiKey, userId, contractId } = rain();
  return Boolean(apiKey && userId && contractId);
}

async function call(method: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const { apiKey, baseUrl } = rain();
  if (!apiKey) throw new RainError("RAIN_API_KEY is not set");
  const headers = new Headers(init.headers);
  headers.set("Api-Key", apiKey);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    method,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new RainError(`${method} ${path} -> ${response.status}: ${text}`);
  }
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

function requireEnv(value: string, name: string): string {
  if (!value) throw new RainError(`${name} is not set`);
  return value;
}

// --- Low-level sandbox API --------------------------------------------------

export async function fundCollateral(amountCents: number, contractId?: string) {
  return call("POST", "/simulate/collateral/fund", {
    body: JSON.stringify({
      contractId: requireEnv(contractId ?? rain().contractId, "RAIN_CONTRACT_ID"),
      currency: "rusd",
      amount: amountCents,
    }),
  });
}

function newSessionId(): { sessionId: string; key: Buffer } {
  const key = randomBytes(16); // 32-hex-char secret as raw bytes (AES-128)
  const encrypted = publicEncrypt(
    {
      key: SANDBOX_PUBLIC_KEY,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    Buffer.from(key.toString("base64")),
  );
  return { sessionId: encrypted.toString("base64"), key };
}

function decryptField(field: { iv: string; data: string }, key: Buffer): string {
  const iv = Buffer.from(field.iv, "base64");
  const payload = Buffer.from(field.data, "base64");
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8").trim();
}

export async function issueScopedCard(
  amountInUsdCents: number,
  allowedMccs?: string[],
  userId?: string,
) {
  const body: Record<string, unknown> = { amountInUSDCents: amountInUsdCents };
  if (allowedMccs?.length) body.allowedMccs = allowedMccs;

  const { sessionId, key } = newSessionId();
  const card = (await call(
    "POST",
    `/issuing/users/${requireEnv(userId ?? rain().userId, "RAIN_USER_ID")}/cards/scoped`,
    {
      headers: { sessionid: sessionId },
      body: JSON.stringify(body),
    },
  )) as {
    id: string;
    encryptedPan: { iv: string; data: string };
    encryptedCvc: { iv: string; data: string };
    expirationMonth: string;
    expirationYear: string;
    last4: string;
    status: string;
  };

  return {
    id: card.id,
    pan: decryptField(card.encryptedPan, key),
    cvc: decryptField(card.encryptedCvc, key),
    expirationMonth: card.expirationMonth,
    expirationYear: card.expirationYear,
    last4: card.last4,
    status: card.status,
  };
}

export async function authorizeTransaction(input: {
  cardId: string;
  amountCents: number;
  merchantName: string;
  merchantCategoryCode: string;
  declineReason?: string;
}) {
  const body: Record<string, unknown> = {
    cardId: input.cardId,
    amount: input.amountCents,
    currency: "USD",
    merchantName: input.merchantName,
    merchantCategoryCode: input.merchantCategoryCode,
  };
  if (input.declineReason) body.declineReason = input.declineReason;
  return call("POST", "/simulate/transactions/authorize", {
    body: JSON.stringify(body),
  }) as Promise<{ transactionId: string } & Record<string, unknown>>;
}

export async function settleTransaction(transactionId: string, amountCents: number) {
  return call("POST", `/simulate/transactions/${transactionId}/settle`, {
    body: JSON.stringify({ amount: amountCents }),
  });
}

export async function listTransactions(limit = 20, cardId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cardId) params.set("cardId", cardId);
  return call("GET", `/issuing/transactions?${params}`) as Promise<
    Array<{
      id: string;
      type?: string;
      spend?: {
        merchantName?: string;
        enrichedMerchantName?: string;
        amount?: number;
        status?: string;
      };
    }>
  >;
}

// --- Agent-facing wrappers (dollars, real merchant language) -----------------

export async function fundTreasury(amountUsd: number): Promise<string> {
  await fundCollateral(Math.round(amountUsd * 100));
  return `Treasury topped up by $${amountUsd.toFixed(2)}.`;
}

export type PayMerchantResult =
  | {
      status: "paid";
      receipt: string;
      merchant: string;
      amount_usd: number;
      card_last4: string;
      memo: string;
    }
  | {
      status: "declined";
      merchant: string;
      reason: string;
    };

export async function payMerchant(input: {
  merchantName: string;
  merchantCategoryCode: string;
  amountUsd: number;
  memo?: string;
}): Promise<PayMerchantResult> {
  const amountCents = Math.round(input.amountUsd * 100);
  try {
    const card = await issueScopedCard(amountCents, [input.merchantCategoryCode]);
    const authorization = await authorizeTransaction({
      cardId: card.id,
      amountCents,
      merchantName: input.merchantName,
      merchantCategoryCode: input.merchantCategoryCode,
    });
    await settleTransaction(authorization.transactionId, amountCents);
    return {
      status: "paid",
      receipt: authorization.transactionId,
      merchant: input.merchantName,
      amount_usd: input.amountUsd,
      card_last4: card.last4,
      memo: input.memo ?? "",
    };
  } catch (error) {
    return {
      status: "declined",
      merchant: input.merchantName,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export type PurchaseHistoryItem = {
  receipt: string;
  merchant: string | undefined;
  amount_usd: number;
  status: string | undefined;
};

export async function purchaseHistory(limit = 20): Promise<PurchaseHistoryItem[]> {
  const transactions = await listTransactions(limit);
  const history: PurchaseHistoryItem[] = [];
  for (const transaction of transactions) {
    if (transaction.type !== "spend") continue;
    const spend = transaction.spend ?? {};
    history.push({
      receipt: transaction.id,
      merchant: spend.merchantName ?? spend.enrichedMerchantName,
      amount_usd: (spend.amount ?? 0) / 100,
      status: spend.status,
    });
  }
  return history;
}

export function mccForOfferKind(kind: string): string {
  switch (kind) {
    case "flight":
      return "4511";
    case "hotel":
      return "7011";
    case "restaurant":
      return "5812";
    default:
      return "5999";
  }
}
