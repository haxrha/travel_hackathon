import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { getOrCreateProfile, updateProfile } from "@/lib/demo/store";

export async function GET() {
  const userId = await requireUserId();
  return NextResponse.json({ profile: getOrCreateProfile(userId) });
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const profile = updateProfile(userId, body);
    return NextResponse.json({ ok: true, profile });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
