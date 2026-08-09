import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/** Inline so Edge middleware does not depend on path aliases. */
function isDemoMode(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  if (!pk || !sk) return true;
  if (pk.includes("placeholder") || sk.includes("placeholder")) return true;
  if (!pk.startsWith("pk_") || !sk.startsWith("sk_")) return true;
  return false;
}

const isProtected = createRouteMatcher([
  "/app(.*)",
  "/api/agent(.*)",
  "/api/trips(.*)",
  "/api/events(.*)",
  "/api/inbox(.*)",
  "/api/profile(.*)",
  "/api/routing(.*)",
  "/api/geocode(.*)",
  "/api/optimize(.*)",
  "/api/world(.*)",
  "/api/booking(.*)",
  "/api/live(.*)",
  "/api/weather(.*)",
  "/api/voice(.*)",
  "/api/eval(.*)",
  "/api/share(.*)",
]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    await auth.protect();
  }
});

export default function middleware(req: NextRequest, event: import("next/server").NextFetchEvent) {
  if (isDemoMode()) {
    return NextResponse.next();
  }
  return withClerk(req, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
