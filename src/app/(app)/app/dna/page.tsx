import Link from "next/link";
import { requireUserId } from "@/server/auth";
import { getOrCreateProfile, getTravelerDna } from "@/lib/demo/store";
import { listDirectory } from "@/lib/enterprise/directory";
import { initials } from "@/lib/enterprise/program";
import DnaEditor from "@/components/app/DnaEditor";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function DnaPage() {
  const userId = await requireUserId();
  const profile = getOrCreateProfile(userId);
  const directory = listDirectory();

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="dna"
        eyebrow="Company"
        title="Travel DNA"
        subtitle="Preferences the Orchestrator reads before every plan — yours, and each traveler's."
      />

      <section className="wp-card p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="wp-section-title">Traveler profiles</h2>
          <Link href="/app/travelers" className="text-xs text-ember hover:underline">
            Open directory
          </Link>
        </div>
        <p className="mt-1.5 text-sm text-text-tertiary">
          Click anyone to view and update their Travel DNA.
        </p>

        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {directory.map((d) => {
            const dna = getTravelerDna(d.id);
            const adventure = Number((dna as any)?.personality?.adventure ?? 5);
            const food = Number((dna as any)?.food?.streetFood ?? 5);
            return (
              <li key={d.id}>
                <Link
                  href={`/app/travelers/${d.id}`}
                  className="wp-card-sunken flex items-center gap-3 p-3.5 transition hover:ring-1 hover:ring-ember/30"
                >
                  <span className="wp-avatar">{initials(d.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-text-primary">{d.name}</div>
                    <div className="truncate text-xs text-text-tertiary">
                      {d.department} · {d.homeAirport}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-text-tertiary">
                      adventure {adventure}/10 · street food {food}/10
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="wp-section-title">Your DNA</h2>
        <DnaEditor initial={profile.dna} subjectName={profile.name} />
      </section>
    </div>
  );
}
