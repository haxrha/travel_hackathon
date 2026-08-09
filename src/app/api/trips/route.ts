import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";

export async function GET() {
  try {
    const userId = await requireUserId();
    const graph = new TravelGraph(userId);
    const trips = await graph.listTrips();
    return NextResponse.json({ trips });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const graph = new TravelGraph(userId);
    const trip = await graph.createTrip({
      title: body.title ?? "New trip",
      destination: body.destination ?? "Somewhere",
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      budgetUsd: body.budgetUsd,
    });
    return NextResponse.json({ trip }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
