import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const userId = await requireUserId();
    const { tripId } = await params;
    const trip = await new TravelGraph(userId).getTrip({ tripId });
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ trip });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
