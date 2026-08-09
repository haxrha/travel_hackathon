import { requireUserId } from "@/server/auth";
import { demoStore } from "@/lib/demo/store";
import InboxClient from "@/components/app/InboxClient";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default async function Inbox() {
  const userId = await requireUserId();
  const docs = demoStore.listInbox(userId);

  return (
    <div className="space-y-6">
      <PageAsciiHero
        variant="inbox"
        eyebrow="Intake"
        title="Travel Inbox"
        subtitle="Forward confirmations or upload files — WAYPORT extracts entities into the Travel Graph."
      />

      <div className="wp-card rounded-2xl p-8">
        <div className="wp-eyebrow">Forward to</div>
        <p className="mt-2 font-mono text-sm">inbox@wayport.dev</p>
        <p className="mt-4 text-sm text-text-secondary">
          Parsed items appear in your trips automatically. Passport, visa, insurance, and receipts link to the Travel Wallet.
        </p>
      </div>

      <InboxClient initialDocs={docs as any} />
    </div>
  );
}
