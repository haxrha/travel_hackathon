import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";
import { TravelGraph } from "@/lib/graph/service";

/** Parse uploaded travel docs into the Travel Graph (demo extraction). */
export async function GET() {
  const userId = await requireUserId();
  if (isMemoryGraph()) {
    return NextResponse.json({ docs: demoStore.listInbox(userId) });
  }
  return NextResponse.json({ docs: [] });
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const name = file.name;
    const lower = name.toLowerCase();
    const extracted: { kind: string; title: string; detail: string }[] = [];

    if (/board|flight|pnr|eticket|e-ticket/.test(lower)) {
      extracted.push({ kind: "FLIGHT", title: `Flight from ${name}`, detail: "Parsed confirmation · seat TBD" });
    } else if (/hotel|booking|reservation|folio/.test(lower)) {
      extracted.push({ kind: "HOTEL", title: `Hotel stay from ${name}`, detail: "Check-in extracted" });
    } else if (/passport|visa|id/.test(lower)) {
      extracted.push({ kind: "DOCUMENT", title: "Travel document", detail: name });
    } else {
      extracted.push({ kind: "CUSTOM", title: `Attachment: ${name}`, detail: "Queued for vision extraction" });
    }

    const trips = await new TravelGraph(userId).listTrips();
    const tripId = trips[0]?.id as string | undefined;

    if (tripId && extracted[0]?.kind !== "DOCUMENT") {
      await new TravelGraph(userId).addItem(tripId, {
        kind: (extracted[0].kind as any) || "CUSTOM",
        title: extracted[0].title,
        status: "TENTATIVE",
        payload: { source: "inbox", file: name },
      });
    }

    const doc = isMemoryGraph()
      ? demoStore.addInbox({
          userId,
          name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          extracted,
          tripId,
        })
      : {
          id: `up-${Date.now()}`,
          name,
          mime: file.type,
          size: file.size,
          extracted,
          tripId,
          createdAt: new Date(),
        };

    return NextResponse.json({ ok: true, doc, tripId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
