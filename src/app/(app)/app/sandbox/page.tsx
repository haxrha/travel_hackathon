import { requireUserId } from "@/server/auth";
import { TravelGraph } from "@/lib/graph/service";
import SandboxClient from "@/components/app/SandboxClient";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function SandboxPage() {
  const userId = await requireUserId();
  const trips = await new TravelGraph(userId).listTrips();
  return (
    <div className="space-y-8">
      <PageAsciiHero
        variant="sandbox"
        eyebrow="Studio"
        title="Sandbox"
        subtitle="Simulate disruptions and watch Guardian replan the Travel Graph."
      />
      <SandboxClient tripId={trips[0]?.id} />
    </div>
  );
}
