import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUserId } from "@/server/auth";
import { demoStore, getTravelerDna } from "@/lib/demo/store";
import {
  findDirectoryByEmail,
  findDirectoryTraveler,
  listDirectory,
} from "@/lib/enterprise/directory";
import { initials } from "@/lib/enterprise/program";
import DnaEditor from "@/components/app/DnaEditor";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function TravelerProfilePage({
  params,
}: {
  params: Promise<{ travelerId: string }>;
}) {
  await requireUserId();
  const { travelerId: raw } = await params;
  const travelerId = decodeURIComponent(raw);

  const dir =
    findDirectoryTraveler(travelerId) ??
    findDirectoryByEmail(travelerId) ??
    listDirectory().find((d) => d.id === travelerId);

  // Ad-hoc traveler keyed by email — still show a profile shell.
  const emailFallback = !dir && travelerId.includes("@") ? travelerId : null;
  if (!dir && !emailFallback) notFound();

  const key = dir?.id ?? emailFallback!;
  const dna = getTravelerDna(key);
  const name = dir?.name ?? emailFallback!.split("@")[0]!;
  const title = dir?.title ?? "Traveler";
  const department = dir?.department ?? "Unassigned";
  const home = dir ? `${dir.homeCity} · ${dir.homeAirport}` : undefined;

  // Upcoming trips this person is on (demo store).
  const trips = demoStore.listCoordinatedTrips().filter((t) =>
    t.coordination!.travelers.some(
      (a) =>
        a.email.toLowerCase() === (dir?.email ?? emailFallback!).toLowerCase(),
    ),
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/app/travelers"
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary transition hover:text-ember"
        >
          <ArrowLeft size={12} /> All travelers
        </Link>
      </div>

      <PageAsciiHero
        variant="dna"
        eyebrow={department}
        title={name}
        subtitle={
          home
            ? `${title} · ${home}. Edit Travel DNA so the Orchestrator plans for this person.`
            : `${title}. Edit Travel DNA so the Orchestrator plans for this person.`
        }
      />

      <section className="wp-card flex flex-wrap items-center gap-4 p-5">
        <span className="wp-avatar text-base">{initials(name)}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{name}</div>
          <div className="text-sm text-text-tertiary">
            {dir?.email ?? emailFallback}
            {dir?.dietary?.length ? ` · ${dir.dietary.join(", ")}` : ""}
            {dir?.accessibility?.length ? ` · ${dir.accessibility.join(", ")}` : ""}
          </div>
        </div>
        {trips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {trips.map((t) => (
              <Link
                key={t.id}
                href={`/app/trips/${t.id}`}
                className="wp-badge wp-badge-neutral hover:wp-badge-accent"
              >
                {t.title}
              </Link>
            ))}
          </div>
        )}
      </section>

      <DnaEditor initial={dna} travelerId={key} subjectName={name} />
    </div>
  );
}
