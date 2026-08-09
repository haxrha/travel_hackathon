/**
 * Demo / local mode: when Clerk keys are missing or still placeholders,
 * skip auth so the marketing site + app shell can be viewed without signup.
 */
export function isDemoMode(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  if (!pk || !sk) return true;
  if (pk.includes("placeholder") || sk.includes("placeholder")) return true;
  if (!pk.startsWith("pk_") || !sk.startsWith("sk_")) return true;
  return false;
}
