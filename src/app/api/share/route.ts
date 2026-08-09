import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { buildWorldModel } from "@/lib/graph/world";
import { createShare, getShare, shareMarkdown } from "@/lib/share/trip";

export async function POST(req: Request) {
  const userId = await requireUserId();
  const body = await req.json().catch(() => ({}));
  const tripId = body.tripId as string | undefined;
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const trip = await new TravelGraph(userId).getTrip({ tripId });
  if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const model = await buildWorldModel(userId, tripId);
  const items = trip.items.map((it: any) => ({
    kind: it.kind,
    title: it.title,
    priceUsd: typeof it.payload?.priceUsd === "number" ? it.payload.priceUsd : undefined,
    location: it.location,
  }));
  const grandTotalUsd =
    items.reduce((s, it) => s + (it.priceUsd ?? 0), 0) ||
    Number((trip as any).budgets?.[0]?.actual ?? 0);

  const q = model.quality;
  const qualityNums = q
    ? Object.fromEntries(
        Object.entries(q).filter(([, v]) => typeof v === "number") as [string, number][],
      )
    : null;

  const shared = createShare({
    tripId,
    userId,
    title: trip.title,
    destination: trip.destination,
    summary: `${trip.destination} proposal · ${items.length} stops · mode ${trip.mode}`,
    quality: qualityNums,
    items,
    grandTotalUsd,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${base}/share/${shared.token}`;
  const markdown = shareMarkdown(shared);

  return NextResponse.json({
    ok: true,
    token: shared.token,
    url,
    markdown,
    expiresAt: shared.expiresAt,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const shared = getShare(token);
  if (!shared) return NextResponse.json({ error: "expired or missing" }, { status: 404 });
  return NextResponse.json({ ok: true, share: shared, markdown: shareMarkdown(shared) });
}
