import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { listTravelerMemory, persistTravelerMemory, recallTravelerMemory } from "@/lib/backboard/traveler";

export async function GET() {
  try {
    const userId = await requireUserId();
    const memory = await listTravelerMemory(userId);
    return NextResponse.json({ ok: true, ...memory });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Remember a preference without planning a full trip. Used by the memory page. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
    const recalled = await recallTravelerMemory({ userId, text });
    const saved = await persistTravelerMemory({
      userId,
      text,
      learned: recalled.learned,
      applied: recalled.applied,
    });
    return NextResponse.json({
      ok: true,
      ...saved,
      recalled: recalled.recalled,
      learned: recalled.learned,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
