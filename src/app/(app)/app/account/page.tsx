import { requireUserId } from "@/server/auth";
import { getOrCreateProfile } from "@/lib/demo/store";
import AccountClient from "@/components/app/AccountClient";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function AccountPage() {
  const userId = await requireUserId();
  const profile = getOrCreateProfile(userId);
  return (
    <div className="space-y-8">
      <PageAsciiHero variant="account" eyebrow="Account" title={profile.name} subtitle={profile.email} />
      <AccountClient profile={profile} />
    </div>
  );
}
