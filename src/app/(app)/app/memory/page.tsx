import Link from "next/link";
import { requireUserId } from "@/server/auth";
import { listTravelerMemory } from "@/lib/backboard/traveler";
import { isBackboardConfigured } from "@/lib/backboard/env";
import PageAsciiHero from "@/components/app/PageAsciiHero";
import MemoryComposer from "@/components/app/MemoryComposer";

export default async function MemoryPage() {
  const userId = await requireUserId();
  const memory = await listTravelerMemory(userId);
  const configured = isBackboardConfigured();

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="dna"
        eyebrow="You"
        title="Traveler memory"
        subtitle="Facts follow you across trips. Each trip is a new thread; the assistant is the same."
      />

      <section className="wp-card space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="wp-section-title">{configured ? "Backboard Auto" : "Local memory"}</h2>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-text-secondary">
            {configured ? "memory: Auto" : "BACKBOARD_API_KEY not set"}
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          Plan a trip in the{" "}
          <Link href="/app/trips/new" className="text-ember hover:underline">
            concierge
          </Link>{" "}
          and mention a preference offhand — aisle seats, vegetarian, no red-eyes, a $150 nightly ceiling.
          Start a second trip in a new thread. The planner and financial agent already apply what was stored.
        </p>
        {memory.assistantId && (
          <p className="font-mono text-xs text-text-tertiary">Assistant {memory.assistantId}</p>
        )}
        {!configured && (
          <p className="text-xs text-text-tertiary">
            Add BACKBOARD_API_KEY to persist with Backboard. Until then, facts stay on this traveler profile for the life of the server.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="wp-section-title">Known facts</h2>
        {memory.facts.length === 0 ? (
          <div className="wp-card p-6 text-sm text-text-tertiary">
            Nothing stored yet. The first trip teaches the assistant; the second trip is where it shows up unprompted.
          </div>
        ) : (
          <ul className="space-y-2">
            {memory.facts.map((fact) => (
              <li key={fact.id} className="wp-card flex flex-wrap items-baseline justify-between gap-3 px-5 py-4">
                <div>
                  <div className="font-medium">{fact.content}</div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    {fact.kind}
                    {fact.nightlyUsd ? ` · $${fact.nightlyUsd}/night` : ""}
                    {fact.tripId ? ` · trip ${fact.tripId.slice(0, 8)}` : ""}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-text-tertiary">{fact.source}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MemoryComposer />
    </div>
  );
}
