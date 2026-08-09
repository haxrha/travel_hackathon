/**
 * Security layer — PII encryption, consent tracking, audit access, tool scoping.
 * Never let the LLM access raw secrets; only scoped references.
 */

export type Scope = "read:trip" | "book:hotel" | "book:flight" | "call:supplier" | "read:wallet" | "write:dna";

export interface ScopedToken {
  userId: string;
  scopes: Scope[];
  issuedAt: number;
  expiresAt: number;
}

export function issueScopedToken(userId: string, scopes: Scope[], ttlSeconds = 900): ScopedToken {
  return { userId, scopes, issuedAt: Date.now(), expiresAt: Date.now() + ttlSeconds * 1000 };
}

export function can(token: ScopedToken, scope: Scope) {
  return token.scopes.includes(scope) && Date.now() < token.expiresAt;
}

export async function audit(entry: { userId: string; scope: Scope; action: string; detail?: Record<string, unknown> }) {
  // Audit log — currently flows to AgentAction; extend to dedicated Audit model if needed.
  console.info("[AUDIT]", JSON.stringify(entry));
}

/** Mask PII before sending anything through an LLM context. */
export function maskPii(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\+?\d[\d\s().-]{7,}\b/g, "[phone]")
    .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "[card]")
    .replace(/\b[A-Z0-9]{6,}\b/g, (m) => (m.length > 8 ? m.slice(0, 4) + "…" : m));
}
