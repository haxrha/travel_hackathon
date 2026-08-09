import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import NewTripForm from "@/components/app/program/NewTripForm";

export const metadata = { title: "AI Concierge — WAYPORT" };

/**
 * AI Concierge — the single entry point for planning a trip.
 *
 * Collects everything coordination needs (origin, destination, dates, party,
 * budget), asks for whatever is missing, then runs the full planning pass on
 * submit.
 */
export default function NewTripPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/app/trips"
        className="inline-flex items-center gap-1.5 text-sm text-text-tertiary transition hover:text-text-secondary"
      >
        <ChevronLeft size={15} /> Trips
      </Link>

      <header>
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} className="text-ember" strokeWidth={1.7} />
          <span className="wp-eyebrow">AI Concierge</span>
        </div>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight">
          Let&apos;s plan the trip.
        </h1>
        <p className="mt-2 text-text-secondary">
          Describe it in a sentence or fill the fields — I&apos;ll ask for anything I
          still need. On create I coordinate flights, lodging and ground transport
          for everyone travelling.
        </p>
      </header>

      <NewTripForm />
    </div>
  );
}
