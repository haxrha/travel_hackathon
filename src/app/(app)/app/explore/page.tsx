import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import { LocalAgent } from "@/lib/agents/local";
import { defaultAutonomy } from "@/lib/agents/orchestrator";
import PageAsciiHero from "@/components/app/PageAsciiHero";
import LocalnessCard from "@/components/app/LocalnessCard";
import DecisionTracePanel from "@/components/app/DecisionTracePanel";
import Link from "next/link";

export default async function ExplorePage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();
  const dest = trips[0]?.destination ?? "Kyoto";
  const agent = new LocalAgent({ userId, tripId: trips[0]?.id, autonomy: defaultAutonomy() });
  const spots = await agent.discover(`authentic local experiences ${dest}`);
  const decision = (spots as any).decision;
  const ranked = (spots as any).ranked ?? spots.map((s: any) => s.localness).filter(Boolean);

  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="explore"
        eyebrow="Hidden gems"
        title={`Explore ${dest}`}
        subtitle="Ranked by Localness Score — not Google stars. Places locals actually use."
      />

      {decision && <DecisionTracePanel decision={decision} />}

      <div className="grid gap-4 md:grid-cols-2">
        {ranked.map((s: any, i: number) => (
          <LocalnessCard key={i} spot={s} />
        ))}
      </div>

      {trips[0] && (
        <Link href={`/app/trips/${trips[0].id}`} className="wp-cta inline-flex px-5 py-2.5 text-sm">
          Attach to trip graph
        </Link>
      )}
    </div>
  );
}
