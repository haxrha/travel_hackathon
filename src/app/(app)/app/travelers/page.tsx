import Link from "next/link";
import { requireUserId } from "@/server/auth";
import { demoStore } from "@/lib/demo/store";
import PageAsciiHero from "@/components/app/PageAsciiHero";
import {
  projectedAttendeeCost,
  checkPolicy,
  initials,
  tierFor,
  usd,
  RSVP_LABEL,
  PURPOSE_LABEL,
  type Attendee,
  type Program,
} from "@/lib/enterprise/program";
import type { DemoTrip } from "@/lib/demo/store";
import { findDirectoryByEmail } from "@/lib/enterprise/directory";

type Row = {
  attendee: Attendee;
  trip: DemoTrip;
  flags: ReturnType<typeof checkPolicy>;
  costUsd: number;
  estimated: boolean;
  profileHref: string;
};

function tripAsProgram(trip: DemoTrip): Program {
  const c = trip.coordination!;
  return {
    id: trip.id,
    name: trip.title,
    purpose: c.purpose,
    status: "BOOKING",
    destination: trip.destination,
    venue: c.agenda[0]?.location ?? trip.destination,
    arrivalAirport: trip.arrivalAirport ?? "",
    startDate: trip.startDate ?? new Date(),
    endDate: trip.endDate ?? new Date(),
    organizerName: "Aryan",
    organizerEmail: "aryan@wayport.demo",
    costCenter: c.costCenter ?? "",
    budgetUsd: Number(trip.budgets[0]?.totalBudget ?? 0),
    policyTier: c.policyTier,
    attendees: c.travelers,
    roomBlocks: c.roomBlocks,
    approvals: c.approvals,
    agenda: c.agenda,
    createdAt: trip.createdAt,
  };
}

function profileHrefFor(a: Attendee): string {
  const dir = findDirectoryByEmail(a.email);
  return `/app/travelers/${dir?.id ?? encodeURIComponent(a.email)}`;
}

const RSVP_TONE: Record<Attendee["rsvp"], string> = {
  ACCEPTED: "wp-badge-ok",
  TENTATIVE: "wp-badge-warn",
  DECLINED: "wp-badge-err",
  INVITED: "wp-badge-neutral",
};

export default async function TravelersPage() {
  const userId = await requireUserId();
  // Touch the store so the demo seed exists before we read coordinated trips.
  demoStore.listTrips(userId);
  const trips = demoStore.listCoordinatedTrips();

  // One row per person per upcoming trip — this directory answers "who is
  // travelling", not "who is employed".
  const rows: Row[] = trips.flatMap((trip) => {
    const program = tripAsProgram(trip);
    return trip.coordination!.travelers.map((attendee) => {
      const cost = projectedAttendeeCost(attendee, program);
      return {
        attendee,
        trip,
        flags: checkPolicy(attendee, tierFor(attendee, trip.coordination!.policyTier)),
        costUsd: cost.totalUsd,
        estimated: cost.estimated,
        profileHref: profileHrefFor(attendee),
      };
    });
  });

  const departments = [...new Set(rows.map((r) => r.attendee.department))].sort();
  const travelling = rows.filter((r) => r.attendee.rsvp !== "DECLINED");
  const flagged = rows.filter((r) => r.flags.length > 0);
  const needs = rows.filter(
    (r) => (r.attendee.dietary?.length ?? 0) + (r.attendee.accessibility?.length ?? 0) > 0,
  );
  const totalCost = travelling.reduce((s, r) => s + r.costUsd, 0);

  return (
    <div className="space-y-6">
      <PageAsciiHero
        variant="travelers"
        eyebrow="Company"
        title="Travelers"
        subtitle="Everyone with travel on the books — click a name for their Travel DNA profile."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="wp-stat">
          <span className="wp-stat-label">Travelling</span>
          <span className="wp-stat-value">{travelling.length}</span>
          <span className="text-xs text-text-tertiary">
            across {trips.length} trip{trips.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="wp-stat">
          <span className="wp-stat-label">Policy flags</span>
          <span className={`wp-stat-value ${flagged.length ? "text-warn" : "text-ok"}`}>
            {flagged.length}
          </span>
          <span className="text-xs text-text-tertiary">travelers needing review</span>
        </div>
        <div className="wp-stat">
          <span className="wp-stat-label">Special needs</span>
          <span className="wp-stat-value">{needs.length}</span>
          <span className="text-xs text-text-tertiary">dietary or accessibility</span>
        </div>
        <div className="wp-stat">
          <span className="wp-stat-label">Committed spend</span>
          <span className="wp-stat-value">{usd(totalCost)}</span>
          <span className="text-xs text-text-tertiary">
            {departments.length} department{departments.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <section className="wp-card p-6">
        <h2 className="wp-section-title">Directory</h2>
        <p className="mt-1.5 text-sm text-text-tertiary">
          Grouped by department. Policy standing is evaluated live against each
          trip&apos;s policy tier.
        </p>

        <div className="mt-6 space-y-8">
          {departments.map((dept) => {
            const deptRows = rows.filter((r) => r.attendee.department === dept);
            return (
              <div key={dept}>
                <div className="flex items-baseline gap-3">
                  <h3 className="font-display text-sm font-semibold tracking-wide">{dept}</h3>
                  <span className="text-xs text-text-tertiary">
                    {deptRows.length} traveler{deptRows.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="wp-table-wrap mt-3">
                  <table className="wp-table">
                    <thead>
                      <tr>
                        <th>Traveler</th>
                        <th>Home</th>
                        <th>Trip</th>
                        <th>Standing</th>
                        <th>RSVP</th>
                        <th className="wp-num">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptRows.map(({ attendee: a, trip, flags, costUsd, estimated, profileHref }) => (
                        <tr key={`${trip.id}-${a.id}`}>
                          <td>
                            <Link
                              href={profileHref}
                              className="flex items-center gap-3 rounded-lg outline-none ring-ember/40 transition hover:bg-white/[0.03] focus-visible:ring-2"
                            >
                              <span className="wp-avatar">{initials(a.name)}</span>
                              <div className="min-w-0">
                                <div className="truncate font-medium text-text-primary hover:text-ember">
                                  {a.name}
                                </div>
                                <div className="truncate text-xs text-text-tertiary">
                                  {a.title}
                                </div>
                                {(a.dietary?.length || a.accessibility?.length) && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {[...(a.dietary ?? []), ...(a.accessibility ?? [])].map(
                                      (n) => (
                                        <span key={n} className="wp-badge wp-badge-neutral">
                                          {n}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            </Link>
                          </td>

                          <td className="whitespace-nowrap font-mono text-xs">
                            {a.originAirport}
                          </td>

                          <td className="text-xs">
                            <Link
                              href={`/app/trips/${trip.id}`}
                              className="text-text-primary underline-offset-4 hover:text-ember hover:underline"
                            >
                              {trip.title}
                            </Link>
                            <div className="text-text-tertiary">
                              {PURPOSE_LABEL[trip.coordination!.purpose]}
                            </div>
                          </td>

                          <td>
                            {flags.length === 0 ? (
                              <span className="wp-badge wp-badge-ok">In policy</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {flags.map((f) => (
                                  <span
                                    key={f.kind}
                                    title={f.detail}
                                    className={`wp-badge ${f.severity === "err" ? "wp-badge-err" : "wp-badge-warn"}`}
                                  >
                                    {f.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td>
                            <span className={`wp-badge ${RSVP_TONE[a.rsvp]}`}>
                              {RSVP_LABEL[a.rsvp]}
                            </span>
                          </td>

                          <td className="wp-num whitespace-nowrap font-medium text-text-primary">
                            {costUsd > 0 ? (
                              <span title={estimated ? "Estimated — no live quote yet" : undefined}>
                                {usd(costUsd)}
                                {estimated ? (
                                  <span className="ml-1 text-[10px] font-normal text-text-tertiary">
                                    est.
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
