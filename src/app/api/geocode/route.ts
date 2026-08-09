import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { geocode } from "@/lib/mapbox/geocoding";

export async function GET(req: Request) {
  await requireUserId();
  const q = new URL(req.url).searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const result = await geocode(q);
  return NextResponse.json({ ok: true, result });
}
