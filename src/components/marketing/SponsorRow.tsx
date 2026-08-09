const PARTNERS = [
  { name: "Amadeus", role: "GDS fares and ticketing" },
  { name: "Stay22", role: "Live hotel pricing and inventory" },
  { name: "Tavily", role: "Real-time travel intelligence" },
  { name: "ElevenLabs", role: "Voice agents for supplier calls" },
  { name: "Mapbox", role: "Routing and ground-time modeling" },
  { name: "Viator", role: "Experiences and group activities" },
];

export default function SponsorRow() {
  return (
    <div className="wp-card p-8 md:p-10">
      <p className="wp-eyebrow text-center">Running on real travel infrastructure</p>

      <div className="mt-8 grid grid-cols-2 items-center justify-items-center gap-6 sm:grid-cols-3 md:grid-cols-6">
        {PARTNERS.map((p) => (
          <span
            key={p.name}
            title={p.role}
            className="font-display text-lg tracking-wide text-text-tertiary transition hover:text-text-primary"
          >
            {p.name}
          </span>
        ))}
      </div>

      <div className="mt-10 grid gap-x-8 gap-y-3 border-t border-white/8 pt-8 text-sm text-text-tertiary sm:grid-cols-2 md:grid-cols-3">
        {PARTNERS.map((p) => (
          <div key={p.name}>
            <span className="text-text-secondary">{p.name}</span> · {p.role}
          </div>
        ))}
      </div>
    </div>
  );
}
