import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { parseIntakeSmart } from "@/lib/trip/intake-ai";
import type { TripIntake } from "@/lib/trip/intake";

export async function POST(req: Request) {
  try {
    await requireUserId();
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const known = (body.known ?? {}) as Partial<TripIntake>;
    const parsed = await parseIntakeSmart(text, known);
    return NextResponse.json({ ok: true, parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
