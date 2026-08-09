import { requireUserId } from "@/server/auth";
import { getOrCreateProfile } from "@/lib/demo/store";
import AutonomyClient from "@/components/app/AutonomyClient";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function AutonomyPage() {
  const userId = await requireUserId();
  const profile = getOrCreateProfile(userId);
  return (
    <div className="w-full space-y-8">
      <PageAsciiHero
        variant="autonomy"
        eyebrow="You"
        title="Autonomy"
        subtitle="How much WAYPORT can execute without asking."
      />
      <AutonomyClient initial={profile.autonomy} />
    </div>
  );
}
