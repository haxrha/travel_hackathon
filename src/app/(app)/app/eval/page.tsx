import PageAsciiHero from "@/components/app/PageAsciiHero";
import EvalClient from "@/components/app/EvalClient";
import { requireUserId } from "@/server/auth";
import { demoStore, isMemoryGraph } from "@/lib/demo/store";
import { TravelGraph } from "@/lib/graph/service";

export default async function EvalPage() {
  const userId = await requireUserId();
  const trips = isMemoryGraph()
    ? demoStore.listTrips(userId)
    : await new TravelGraph(userId).listTrips();
  const tripId = trips[0]?.id;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageAsciiHero
        variant="sandbox"
        eyebrow="Research"
        title="Eval harness"
        subtitle="Ten disruption scenarios → constraint satisfaction %. Research-grade demo for judges."
      />
      <EvalClient tripId={tripId} />
    </div>
  );
}
