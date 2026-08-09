import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MapPin, PlaneTakeoff, Users } from "lucide-react";
import TripDetail from "@/components/app/TripDetail";
import CoordinationView from "@/components/app/program/CoordinationView";
import { fmtDateRange, initials, PURPOSE_LABEL } from "@/lib/enterprise/program";

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const userId = await requireUserId();
  const { tripId } = await params;
  const trip = await new TravelGraph(userId).getTrip({ tripId });
  if (!trip) notFound();

  const actions = isMemoryGraph() ? demoStore.listActions(userId, tripId) : [];
  const meta = isMemoryGraph() ? demoStore.getTripMeta(tripId) : {};
  const stored = isMemoryGraph() ? demoStore.getTripById(tripId) : null;
  const coordination = stored?.coordination;

  // Backfill Gemini/synthetic research quotes for trips created before
  // quote-research existed (or when proposal still says "Not quoted").
  if (stored && coordination) {
    const unpriced =
      !stored.meta?.researchQuotes ||
      !coordination.travelers.some((t) => (t.inbound?.priceUsd ?? 0) > 0) ||
      coordination.proposal?.flights?.some(
        (f) => f.price?.status === "unavailable" || f.price?.amount_usd == null,
      );
    if (unpriced) {
      try {
        const { enrichTripWithLiveQuotes } = await import("@/lib/agents/quote-research");
        const { buildTripProposalDocument } = await import("@/lib/firebase/trip-document");
        await enrichTripWithLiveQuotes(stored);
        coordination.proposal = buildTripProposalDocument(stored);
        // Best-effort Firestore refresh — don't block the page on network.
        void import("@/lib/firebase/trips").then(({ syncTripToFirestore }) =>
          syncTripToFirestore(stored, { userId, skipQuotes: true }),
        );
      } catch (e) {
        console.warn("[trip page] quote enrich failed", e);
      }
    }
  }

  const itinerary = (
    <TripDetail trip={trip as never} actions={actions as never} meta={meta} />
  );

  // Solo trips skip the coordination shell entirely — no tabs, no empty roster.
  if (!coordination || !stored) return itinerary;

  const party = coordination.travelers.filter((t) => t.rsvp !== "DECLINED");

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/app/trips"
          className="inline-flex items-center gap-1.5 text-sm text-text-tertiary transition hover:text-text-secondary"
        >
          <ChevronLeft size={15} /> Trips
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="wp-badge wp-badge-accent">
                {PURPOSE_LABEL[coordination.purpose]}
              </span>
              {coordination.costCenter && (
                <span className="wp-badge wp-badge-neutral">{coordination.costCenter}</span>
              )}
              <span className="wp-badge wp-badge-neutral">
                Policy · {coordination.policyTier.name}
              </span>
            </div>

            <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {stored.title}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
              {stored.startDate && stored.endDate && (
                <span>{fmtDateRange(stored.startDate, stored.endDate)}</span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13} className="text-text-tertiary" />
                {stored.destination}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PlaneTakeoff size={13} className="text-text-tertiary" />
                {stored.origin ?? "Origin not set"}
                {stored.arrivalAirport ? ` → ${stored.arrivalAirport}` : ""}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={13} className="text-text-tertiary" />
                {party.length} travelers
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="wp-avatar-stack">
              {party.slice(0, 6).map((a) => (
                <span key={a.id} className="wp-avatar" title={a.name}>
                  {initials(a.name)}
                </span>
              ))}
              {party.length > 6 && <span className="wp-avatar">+{party.length - 6}</span>}
            </div>
            <Link
              href={`/app?tripId=${encodeURIComponent(stored.id)}`}
              className="wp-cta inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <MapPin size={14} /> Open Map OS
            </Link>
          </div>
        </div>
      </header>

      <CoordinationView trip={stored} itinerary={itinerary} />
    </div>
  );
}
