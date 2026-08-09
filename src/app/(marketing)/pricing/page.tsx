import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Nav } from "@/components/marketing/Nav";

type Tier = {
  name: string;
  price: string;
  unit?: string;
  blurb: string;
  cta: string;
  href: string;
  highlight?: boolean;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "Solo",
    price: "$0",
    blurb: "For one traveler planning their own trips.",
    cta: "Start free",
    href: "/app",
    features: [
      "Unlimited trip plans",
      "Travel Graph + live replanning",
      "Local discovery and experiences",
      "Travel wallet and documents",
    ],
  },
  {
    name: "Team",
    price: "$18",
    unit: "/ traveler / month",
    blurb: "For managers coordinating group travel.",
    cta: "Open a trip",
    href: "/app/trips",
    highlight: true,
    features: [
      "Everything in Solo",
      "Programs — multi-traveler coordination",
      "Travel policy tiers and approval routing",
      "Arrival convergence and shared transfers",
      "Room block tracking with cutoff alerts",
      "Cost-center budgets, committed vs. projected",
      "Autonomous monitoring and voice agent",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    blurb: "For finance and travel operations at scale.",
    cta: "Talk to us",
    href: "/app/trips",
    features: [
      "Everything in Team",
      "SSO, SCIM, and role-based access",
      "Negotiated rate and contracted-property loading",
      "ERP and expense system integration",
      "Full audit trail and data residency options",
      "Dedicated travel advisor desk",
    ],
  },
];

const COMPARISON: { label: string; solo: boolean; team: boolean; ent: boolean }[] = [
  { label: "Individual itinerary planning", solo: true, team: true, ent: true },
  { label: "Live disruption replanning", solo: true, team: true, ent: true },
  { label: "Multi-traveler programs", solo: false, team: true, ent: true },
  { label: "Policy tiers and approvals", solo: false, team: true, ent: true },
  { label: "Room blocks and cutoff tracking", solo: false, team: true, ent: true },
  { label: "Cost-center reporting", solo: false, team: true, ent: true },
  { label: "SSO and SCIM provisioning", solo: false, team: false, ent: true },
  { label: "Negotiated rate loading", solo: false, team: false, ent: true },
  { label: "Audit trail export", solo: false, team: false, ent: true },
];

export default function Pricing() {
  return (
    <main className="relative flex-1">
      <Nav />

      <section className="mx-auto max-w-6xl px-6 pt-36 pb-20 text-center">
        <span className="wp-eyebrow">Pricing</span>
        <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
          Priced per traveler.
          <br />
          Not per booking.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          No booking fees, no markup on fares, no percentage of spend. WAYPORT makes money
          when your team travels well, not when it travels expensively.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col p-8 ${
                t.highlight
                  ? "wp-card-raised ring-1 ring-ember/35"
                  : "wp-card"
              }`}
            >
              {t.highlight && (
                <span className="wp-badge wp-badge-accent absolute -top-2.5 left-8">
                  Most teams start here
                </span>
              )}

              <h2 className="font-display text-xl font-semibold">{t.name}</h2>
              <p className="mt-2 text-sm text-text-tertiary">{t.blurb}</p>

              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-semibold tracking-tight">
                  {t.price}
                </span>
                {t.unit && <span className="text-sm text-text-tertiary">{t.unit}</span>}
              </div>

              <ul className="mt-7 flex-1 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-text-secondary">
                    <Check size={15} className="mt-0.5 shrink-0 text-ok" strokeWidth={2} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={t.href}
                className={`mt-8 block py-3 text-center text-sm ${
                  t.highlight ? "wp-cta" : "wp-cta-ghost"
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto max-w-4xl px-6 pb-28">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          What&apos;s in each plan
        </h2>

        <div className="wp-table-wrap wp-card mt-6 p-2">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th className="text-center">Solo</th>
                <th className="text-center">Team</th>
                <th className="text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((r) => (
                <tr key={r.label}>
                  <td className="text-text-primary">{r.label}</td>
                  {[r.solo, r.team, r.ent].map((v, i) => (
                    <td key={i} className="text-center">
                      {v ? (
                        <Check
                          size={16}
                          className="mx-auto text-ok"
                          strokeWidth={2}
                          aria-label="Included"
                        />
                      ) : (
                        <Minus
                          size={16}
                          className="mx-auto text-text-tertiary/50"
                          aria-label="Not included"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-sm text-text-tertiary">
          Team and Enterprise are billed on active travelers — someone who took at least one
          trip that month. Invited-but-idle seats are free.
        </p>
      </section>

      <footer className="border-t border-white/10 bg-black/30 py-12 text-center">
        <Link href="/app/trips" className="wp-cta inline-block px-8 py-3.5">
          Open the demo trip
        </Link>
      </footer>
    </main>
  );
}
