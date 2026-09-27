/**
 * Process-local payment ledger so the Money page and booking UI can show
 * Stripe receipts without waiting on a second API call. Webhook fulfillment
 * updates the same list.
 */

export type LedgerEntry = {
  id: string;
  userId: string;
  tripId?: string;
  offerId?: string;
  merchant: string;
  amountUsd: number;
  status: "paid" | "pending" | "failed";
  cardLast4?: string;
  checkoutUrl?: string;
  paymentIntentId?: string;
  createdAt: string;
};

const g = globalThis as unknown as { __wayportStripeLedger?: LedgerEntry[] };

function ledger(): LedgerEntry[] {
  if (!g.__wayportStripeLedger) g.__wayportStripeLedger = [];
  return g.__wayportStripeLedger;
}

export function recordLedger(entry: LedgerEntry) {
  const rows = ledger();
  const index = rows.findIndex((row) => row.id === entry.id);
  if (index >= 0) rows[index] = { ...rows[index], ...entry };
  else rows.unshift(entry);
  return entry;
}

export function findLedger(id: string) {
  return ledger().find((row) => row.id === id);
}

export function listLedger(userId?: string, limit = 20): LedgerEntry[] {
  const rows = userId ? ledger().filter((row) => row.userId === userId) : ledger();
  return rows.slice(0, limit);
}
