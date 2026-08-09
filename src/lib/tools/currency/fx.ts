/** Currency intelligence — budget normalization, FX, trip math. */

export interface FxQuote {
  from: string;
  to: string;
  rate: number;
}

export async function getRate(from: string, to: string): Promise<FxQuote> {
  const res = await fetch("https://api.exchangerate.host/latest?base=" + from + "&symbols=" + to, { next: { revalidate: 3600 } }).catch(() => null);
  if (res?.ok) {
    const data = await res.json().catch(() => null);
    const rate = data?.rates?.[to];
    if (typeof rate === "number") return { from, to, rate };
  }
  // Offline fallback
  return { from, to, rate: from === "USD" && to === "JPY" ? 149.4 : from === "USD" && to === "EUR" ? 0.92 : 1 };
}

export function convert(amountUsd: number, to: string, rate = 1) {
  return Math.round(amountUsd * rate * 100) / 100;
}
