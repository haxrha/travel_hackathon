import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { getTravelerDna, updateTravelerDna } from "@/lib/demo/store";
import { findDirectoryByEmail, findDirectoryTraveler } from "@/lib/enterprise/directory";

function resolveKey(travelerId: string): string {
  const decoded = decodeURIComponent(travelerId);
  const dir = findDirectoryTraveler(decoded) ?? findDirectoryByEmail(decoded);
  return dir?.id ?? decoded;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ travelerId: string }> },
) {
  await requireUserId();
  const { travelerId } = await ctx.params;
  const key = resolveKey(travelerId);
  const dir = findDirectoryTraveler(key) ?? findDirectoryByEmail(key);
  return NextResponse.json({
    travelerId: key,
    traveler: dir ?? null,
    dna: getTravelerDna(key),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ travelerId: string }> },
) {
  try {
    await requireUserId();
    const { travelerId } = await ctx.params;
    const key = resolveKey(travelerId);
    const body = await req.json();
    const dna = body?.dna;
    if (!dna || typeof dna !== "object") {
      return NextResponse.json({ error: "dna object required" }, { status: 400 });
    }
    const saved = updateTravelerDna(key, dna);
    return NextResponse.json({ ok: true, travelerId: key, dna: saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
