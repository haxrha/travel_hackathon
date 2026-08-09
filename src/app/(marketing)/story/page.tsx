import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Nav } from "@/components/marketing/Nav";

const LAYERS = [
  {
    n: "01",
    name: "Traveler model",
    body: "Home airport, policy tier, dietary and accessibility needs, seat and stay preferences, loyalty balances. Every option is scored against the person who'll actually take the trip.",
  },
  {
    n: "02",
    name: "Travel graph",
    body: "The trip as nodes and edges, not a list. Flights, stays, meetings and transfers connected by real ground time, cost, and reliability — so the system knows what breaks when one node moves.",
  },
  {
    n: "03",
    name: "Program layer",
    body: "Many travelers against one event. Room blocks, arrival convergence, shared agenda, and a single cost center. This is the layer consumer travel tools have never had.",
  },
  {
    n: "04",
    name: "Policy engine",
    body: "Every proposed action classified by risk before it runs. Research is free, spending is gated, external contact needs sign-off. The boundary is configuration, not vibes.",
  },
  {
    n: "05",
    name: "Replanning loop",
    body: "A delay, a cancellation, a weather event. The graph recomputes, the affected travelers are re-solved, and the organizer gets a diff — what changed, who it hit, what it cost.",
  },
];

export default function Story() {
  return (
    <main className="relative flex-1">
      <Nav />

      <section className="mx-auto max-w-3xl px-6 pt-36 pb-16">
        <span className="wp-eyebrow">The problem</span>
        <h1 className="font-display mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          The traveler became the integration layer.
        </h1>
        <p className="mt-8 text-lg leading-relaxed text-text-secondary">
          Flights live in one tab, hotels in another, the agenda in a doc, the budget in a
          spreadsheet, and the group&apos;s RSVPs in a thread nobody reads. When something
          breaks at 2am in a foreign airport, a person has to hold all of it in their head
          and re-derive the plan by hand.
        </p>
        <p className="mt-5 text-lg leading-relaxed text-text-secondary">
          For one traveler that&apos;s annoying. For fourteen travelers converging on one
          offsite from nine cities, it&apos;s a second job — and it lands on a manager who
          was hired to do something else.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20">
        <div className="wp-card-raised p-8">
          <span className="wp-eyebrow">What WAYPORT is</span>
          <p className="mt-4 text-lg leading-relaxed">
            An operating system for company travel. It models the traveler, maintains a live
            graph of every trip, coordinates the parts that only make sense across a group,
            enforces policy before money moves, and replans automatically when reality
            changes — routing only genuine exceptions to a human.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <span className="wp-eyebrow">How it&apos;s built</span>
        <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight">
          Five layers, one loop.
        </h2>

        <ol className="mt-12 space-y-10">
          {LAYERS.map((l) => (
            <li key={l.n} className="grid gap-4 sm:grid-cols-[4rem,1fr]">
              <div className="font-display pt-1 text-sm tracking-[0.3em] text-ember">
                {l.n}
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold">{l.name}</h3>
                <p className="mt-2.5 leading-relaxed text-text-secondary">{l.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-32">
        <div className="wp-card p-8 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            See the loop running.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-text-secondary">
            A live program with twelve travelers, three policy breaches, and a room block
            about to release.
          </p>
          <Link
            href="/app/trips"
            className="wp-cta mt-7 inline-flex items-center gap-2 px-7 py-3.5"
          >
            Open the demo trip <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
