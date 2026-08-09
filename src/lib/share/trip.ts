/**
 * In-memory share tokens for trip proposals (demo mode + process lifetime).
 */

export type SharedTrip = {
  token: string;
  tripId: string;
  userId: string;
  title: string;
  destination: string;
  summary: string;
  quality?: Record<string, number> | null;
  items: { kind: string; title: string; priceUsd?: number; location?: string | null }[];
  grandTotalUsd: number;
  createdAt: string;
  expiresAt: string;
};

const g = globalThis as unknown as { __wpShares?: Map<string, SharedTrip> };

function shares() {
  if (!g.__wpShares) g.__wpShares = new Map();
  return g.__wpShares;
}

export function createShare(payload: Omit<SharedTrip, "token" | "createdAt" | "expiresAt"> & { ttlHours?: number }) {
  const token = `wp_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  const ttl = (payload.ttlHours ?? 72) * 3600_000;
  const row: SharedTrip = {
    token,
    tripId: payload.tripId,
    userId: payload.userId,
    title: payload.title,
    destination: payload.destination,
    summary: payload.summary,
    quality: payload.quality ?? null,
    items: payload.items,
    grandTotalUsd: payload.grandTotalUsd,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttl).toISOString(),
  };
  shares().set(token, row);
  return row;
}

export function getShare(token: string) {
  const row = shares().get(token);
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    shares().delete(token);
    return null;
  }
  return row;
}

export function shareMarkdown(s: SharedTrip) {
  const lines = [
    `# ${s.title}`,
    ``,
    `**Destination:** ${s.destination}`,
    `**Proposal total:** $${Math.round(s.grandTotalUsd)}`,
    ``,
    s.summary,
    ``,
    `## Itinerary`,
    ...s.items.map((it, i) => `${i + 1}. **${it.kind}** — ${it.title}${it.priceUsd != null ? ` ($${it.priceUsd})` : ""}`),
    ``,
  ];
  if (s.quality) {
    lines.push(`## Quality vector`, ...Object.entries(s.quality).map(([k, v]) => `- ${k}: ${Math.round(Number(v) * 100) / 100}`), ``);
  }
  lines.push(`_Shared via WAYPORT · expires ${s.expiresAt}_`);
  return lines.join("\n");
}
