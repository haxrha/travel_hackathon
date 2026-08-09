import { redirect } from "next/navigation";

/**
 * The Concierge and "new trip" are one surface now.
 *
 * They were always the same job — collect what a trip needs, then coordinate
 * it — split across a chat that created trips with no origin or dates, and a
 * form that collected them but never planned. `/app/trips/new` does both.
 */
export default function ConciergeRedirect() {
  redirect("/app/trips/new");
}
