import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Bus,
  CalendarClock,
  Radar,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Dunes } from "@/components/landscape/Dunes";
import TripCommandPreview from "@/components/marketing/TripCommandPreview";
import SponsorRow from "@/components/marketing/SponsorRow";
import { Nav } from "@/components/marketing/Nav";

const CAPABILITIES = [
  {
    icon: Building2,
    title: "Programs, not bookings",
    body: "One offsite, twelve origin cities. WAYPORT books each traveler individually and coordinates what only makes sense together — room blocks, arrivals, agenda, spend.",
  },
  {
    icon: ShieldCheck,
    title: "Policy that explains itself",
    body: "Every fare is checked against the traveler's tier before it reaches you. Breaches arrive as a decision with the overage already calculated, not a spreadsheet to audit.",
  },
  {
    icon: Bus,
    title: "Arrival convergence",
    body: "Twelve inbound flights collapse into three shared transfers. The solver reads real arrival times and caps how long anyone waits for a ride.",
  },
  {
    icon: Wallet,
    title: "Committed vs. projected",
    body: "Cost-center spend split into money already ticketed and money still in pipeline, so finance sees the exposure before it lands, not after.",
  },
  {
    icon: Radar,
    title: "Replans when reality moves",
    body: "A cancelled leg rewrites the ground transfer, the room block, and the agenda for everyone downstream — then tells you what changed and why.",
  },
  {
    icon: CalendarClock,
    title: "Room blocks that don't leak",
    body: "Unassigned rooms release at cutoff. WAYPORT tracks the date, chases the non-responders, and warns you while there's still time to act.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Describe the trip",
    body: "Destination, dates, who's coming, what it's for, and the cost center it lands on.",
  },
  {
    n: "02",
    title: "WAYPORT prices everyone",
    body: "Each traveler gets options from their own origin, checked against their policy tier and personal constraints.",
  },
  {
    n: "03",
    title: "You approve the exceptions",
    body: "Compliant travel books itself. Only genuine breaches reach you — with the overage, the reason, and the alternative.",
  },
];

export default function Landing() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <Nav />

      {/* Hero */}
      <section className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-6 pt-28 pb-24 md:pt-24">
        <Dunes />

        <span className="wp-badge wp-badge-accent">Business travel, coordinated</span>

        <h1 className="font-display mt-6 text-center text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl lg:text-[5.5rem]">
          Nobody should spend
          <br />
          a week booking
          <br />
          a three-day offsite.
        </h1>

        <p className="mt-8 max-w-2xl text-center text-lg leading-relaxed text-text-secondary md:text-xl">
          WAYPORT plans company travel end to end — every traveler priced from their own
          city, every fare checked against policy, every arrival converged into shared
          ground. You approve the exceptions. It handles the rest.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link href="/app/trips" className="wp-cta inline-flex items-center gap-2 px-8 py-4 text-base">
            See a live trip <ArrowRight size={17} />
          </Link>
          <Link href="/story" className="wp-cta-ghost px-8 py-4 text-base">
            Watch it think
          </Link>
        </div>

        <p className="mt-6 text-sm text-text-tertiary">
          No card required · SOC 2 track · SSO and SCIM on enterprise
        </p>

        <div className="mt-20 w-full max-w-5xl">
          <TripCommandPreview />
        </div>
      </section>

      {/* The coordination tax */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-28">
        <div className="max-w-3xl">
          <span className="wp-eyebrow">The coordination tax</span>
          <h2 className="font-display mt-4 text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            The flights were never the hard part.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-text-secondary">
            Booking one person is a solved problem. Booking fourteen people into the same
            room block, from nine airports, under three policy tiers, against one budget —
            that&apos;s the work nobody signed up for. It lands on a manager, in a
            spreadsheet, at 11pm.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            { stat: "17 hrs", label: "Median organizer time per group trip", sub: "across sourcing, chasing RSVPs, and expense cleanup" },
            { stat: "23%", label: "Of group spend booked out of policy", sub: "usually discovered after the trip, not before" },
            { stat: "1 in 4", label: "Room-block rooms released unused", sub: "held against the company, paid for by the company" },
          ].map((s) => (
            <div key={s.stat} className="wp-card p-6">
              <div className="font-display text-4xl font-semibold tracking-tight text-ember">
                {s.stat}
              </div>
              <div className="mt-3 text-sm font-medium text-text-primary">{s.label}</div>
              <div className="mt-1.5 text-sm text-text-tertiary">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 border-y border-white/8 bg-black/20">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <span className="wp-eyebrow">How it works</span>
          <h2 className="font-display mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Three inputs from you. Everything else is the system&apos;s job.
          </h2>

          <ol className="mt-14 grid gap-10 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n}>
                <div className="font-display text-sm tracking-[0.3em] text-ember">{s.n}</div>
                <h3 className="font-display mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-text-secondary">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Capabilities */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-28">
        <span className="wp-eyebrow">Built for the organizer</span>
        <h2 className="font-display mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          Everything that makes group travel expensive, handled upstream.
        </h2>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="wp-card wp-card-interactive p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember/12 ring-1 ring-ember/25">
                <Icon size={18} className="text-ember" strokeWidth={1.7} />
              </span>
              <h3 className="font-display mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Control / governance */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
        <div className="wp-card-raised overflow-hidden">
          <div className="grid gap-10 p-8 md:grid-cols-2 md:p-12">
            <div>
              <span className="wp-eyebrow">Governance</span>
              <h2 className="font-display mt-4 text-3xl font-semibold leading-tight tracking-tight">
                Autonomy you set, and can prove.
              </h2>
              <p className="mt-5 leading-relaxed text-text-secondary">
                Every action the system can take is classified by risk before it runs.
                Read-only research needs nobody. Spending against a cost center needs you.
                The boundary is a setting, not a promise — and every decision is written to
                an audit trail with the inputs that produced it.
              </p>
              <Link
                href="/app/autonomy"
                className="wp-btn-sm mt-7 inline-flex"
                data-tone="accent"
              >
                Configure autonomy <ArrowRight size={13} />
              </Link>
            </div>

            <div className="space-y-2.5">
              {[
                { level: "Level 0–1", label: "Search, compare, recommend", tone: "ok", note: "Runs silently" },
                { level: "Level 2", label: "Hold fares, draft bookings", tone: "ok", note: "Runs silently" },
                { level: "Level 3", label: "Spend against a cost center", tone: "warn", note: "Your approval" },
                { level: "Level 4", label: "Contact suppliers on your behalf", tone: "warn", note: "Your approval" },
                { level: "Level 5", label: "Rebook a disruption autonomously", tone: "err", note: "Threshold-gated" },
              ].map((r) => (
                <div
                  key={r.level}
                  className="wp-card-sunken flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div>
                    <div className="font-mono text-xs text-text-tertiary">{r.level}</div>
                    <div className="mt-0.5 text-sm text-text-primary">{r.label}</div>
                  </div>
                  <span className={`wp-badge wp-badge-${r.tone}`}>{r.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
        <SponsorRow />
      </section>

      {/* Closing CTA */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-32 text-center">
        <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
          Plan the next one in an afternoon.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-secondary">
          Open a live program with twelve travelers already in flight and see what the
          organizer&apos;s view actually looks like.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/app/trips" className="wp-cta inline-flex items-center gap-2 px-8 py-4">
            Open the demo trip <ArrowRight size={17} />
          </Link>
          <Link href="/pricing" className="wp-cta-ghost px-8 py-4">
            See pricing
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 bg-black/30 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center">
          <p className="font-display text-xs tracking-[0.32em] text-white/60">WAYPORT</p>
          <p className="text-sm text-text-tertiary">
            Company travel that coordinates itself.
          </p>
          <nav className="mt-2 flex flex-wrap justify-center gap-6 text-sm text-text-tertiary">
            <Link href="/story" className="transition hover:text-text-secondary">Why WAYPORT</Link>
            <Link href="/pricing" className="transition hover:text-text-secondary">Pricing</Link>
            <Link href="/app/trips" className="transition hover:text-text-secondary">Programs</Link>
            <Link href="/app" className="transition hover:text-text-secondary">Open app</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
