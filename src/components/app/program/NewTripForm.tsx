"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { createTripFromIntake } from "@/app/(app)/app/trips/actions";
import TravelerPicker from "./TravelerPicker";
import type { NewTravelerInput } from "@/lib/enterprise/directory";
import { PURPOSE_LABEL } from "@/lib/enterprise/program";
import {
  toAirportCode,
  FIELD_PROMPT,
  FIELD_HINT,
  REQUIRED_FIELDS,
  type IntakeField,
  type ParsedIntake,
} from "@/lib/trip/intake";

/**
 * Trip intake.
 *
 * One description box drives intake: Fill fields uses Gemini + regex to extract
 * messy free text; anything still missing is asked as a prompt to add to that
 * same box and click again. Structured fields below stay editable. Submit stays
 * blocked until origin, destination, and start date are present.
 */
export default function NewTripForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [freeText, setFreeText] = useState("");
  const [parseResult, setParseResult] = useState<{
    filled: string[];
    missing: IntakeField[];
    travelerHint?: number;
    source?: string;
  } | null>(null);
  const [travelerIds, setTravelerIds] = useState<string[]>([]);
  const [adHoc, setAdHoc] = useState<NewTravelerInput[]>([]);
  const [form, setForm] = useState({
    title: "",
    origin: "",
    destination: "",
    startDate: "",
    endDate: "",
    budgetUsd: "",
    purpose: "OFFSITE",
    costCenter: "",
  });

  const partySize = travelerIds.length + adHoc.length;

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const missing: IntakeField[] = useMemo(
    () =>
      REQUIRED_FIELDS.filter((f) =>
        f === "origin" ? !form.origin.trim()
        : f === "destination" ? !form.destination.trim()
        : !form.startDate,
      ),
    [form.origin, form.destination, form.startDate],
  );

  const originCode = form.origin ? toAirportCode(form.origin) : undefined;

  /**
   * Fills whatever the description contains via Gemini + regex and reports it.
   *
   * Values present in the text overwrite matching form fields. Fields the
   * sentence does not mention stay as-is (via known fallback on the server).
   */
  async function applyFreeText() {
    const text = freeText.trim();
    if (!text || filling) return;

    const known = {
      origin: form.origin.trim() || undefined,
      destination: form.destination.trim() || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      budgetUsd: form.budgetUsd ? Number(form.budgetUsd) : undefined,
      // Don't treat the default OFFSITE as "already known" — let the text win.
      purpose: form.purpose && form.purpose !== "OFFSITE" ? form.purpose : undefined,
      title: form.title.trim() || undefined,
      costCenter: form.costCenter.trim() || undefined,
    };

    setFilling(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, known }),
      });
      const data = await res.json();
      if (!res.ok || !data?.parsed) {
        throw new Error(data?.error || "Could not parse the description");
      }
      const parsed = data.parsed as ParsedIntake & { source?: string };

      setForm((f) => ({
        ...f,
        origin: parsed.origin ?? f.origin,
        destination: parsed.destination ?? f.destination,
        startDate: parsed.startDate ?? f.startDate,
        endDate: parsed.endDate ?? f.endDate,
        budgetUsd:
          parsed.budgetUsd != null && !Number.isNaN(parsed.budgetUsd)
            ? String(parsed.budgetUsd)
            : f.budgetUsd,
        purpose: parsed.purpose ?? f.purpose,
        title: parsed.title ?? f.title,
        costCenter: parsed.costCenter ?? f.costCenter,
      }));

      const filled: string[] = [];
      const changed = (next?: string | number | null, prev?: string) => {
        if (next == null || next === "") return false;
        const n = String(next);
        return !prev?.trim() || n !== prev.trim();
      };
      if (changed(parsed.origin, known.origin)) filled.push(`origin ${parsed.origin}`);
      if (changed(parsed.destination, known.destination)) {
        filled.push(`destination ${parsed.destination}`);
      }
      if (changed(parsed.startDate, known.startDate)) filled.push(`start ${parsed.startDate}`);
      if (changed(parsed.endDate, known.endDate)) filled.push(`end ${parsed.endDate}`);
      if (
        parsed.budgetUsd != null &&
        !Number.isNaN(parsed.budgetUsd) &&
        (known.budgetUsd == null || parsed.budgetUsd !== known.budgetUsd)
      ) {
        filled.push(`budget $${parsed.budgetUsd.toLocaleString()}`);
      }
      if (parsed.purpose && parsed.purpose !== known.purpose) {
        const label =
          (PURPOSE_LABEL as Record<string, string | undefined>)[parsed.purpose] ??
          parsed.purpose;
        filled.push(`purpose ${label}`);
      }
      if (changed(parsed.title, known.title)) filled.push(`name ${parsed.title}`);
      if (changed(parsed.costCenter, known.costCenter)) {
        filled.push(`cost center ${parsed.costCenter}`);
      }

      const stillMissing = REQUIRED_FIELDS.filter((f) =>
        f === "origin" ? !(parsed.origin ?? form.origin.trim())
        : f === "destination" ? !(parsed.destination ?? form.destination.trim())
        : !(parsed.startDate ?? form.startDate),
      );

      setParseResult({
        filled,
        missing: stillMissing,
        travelerHint:
          parsed.travelers && parsed.travelers > 1 ? parsed.travelers : undefined,
        source: parsed.source,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fill fields failed");
    } finally {
      setFilling(false);
    }
  }

  /** Agent stages surfaced while the Orchestrator runs. */
  const [stages, setStages] = useState<string[]>([]);

  function submit() {
    if (missing.length) return;
    setError(null);

    // Stages match the slim create path (planner + graph; specialists deferred).
    setStages(["Creating the trip…"]);
    const timers = [
      window.setTimeout(() => setStages((s) => [...s, "Parsing the brief and scoring trip shapes…"]), 400),
      window.setTimeout(() => setStages((s) => [...s, "Planner drafting the itinerary…"]), 1200),
      window.setTimeout(() => setStages((s) => [...s, "Writing to the Travel Graph…"]), 2800),
      window.setTimeout(() => setStages((s) => [...s, "Research agents quoting flights · hotel · ground…"]), 4500),
    ];
    const clearTimers = () => timers.forEach(window.clearTimeout);

    startTransition(async () => {
      try {
        const res = await createTripFromIntake({
          title: form.title.trim() || `Trip to ${form.destination.trim()}`,
          origin: form.origin.trim(),
          destination: form.destination.trim(),
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          budgetUsd: form.budgetUsd ? Number(form.budgetUsd) : undefined,
          purpose: form.purpose,
          costCenter: form.costCenter.trim() || undefined,
          travelerIds,
          newTravelers: adHoc,
        });
        clearTimers();
        if (res?.tripId) {
          setStages((s) => [
            ...s,
            res.planned
              ? "Travel Graph updated"
              : `Trip saved${res.planError ? ` — plan deferred: ${res.planError}` : ""}`,
          ]);
          router.push(`/app/trips/${res.tripId}`);
        } else {
          setStages([]);
          setError(
            res?.error
              ? `Could not create the trip — ${res.error}.`
              : "Could not create the trip. Check the fields and try again.",
          );
        }
      } catch (e) {
        clearTimers();
        setStages([]);
        setError(e instanceof Error ? e.message : "Could not create the trip.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Single description box: fill what we can, then ask to add what's missing here. */}
      <section
        className={`wp-card p-5 ${
          parseResult && missing.length === 0
            ? "ring-1 ring-ok/25"
            : parseResult && missing.length > 0
              ? "ring-1 ring-warn/30"
              : ""
        }`}
        aria-live="polite"
      >
        <label className="wp-label" htmlFor="freetext">
          Describe the trip
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <textarea
            id="freetext"
            className="wp-input min-h-[5.5rem] resize-y"
            placeholder="Offsite in Lisbon from SFO on March 14 for 4 days, 12 people, $32,000"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            onClick={() => void applyFreeText()}
            disabled={!freeText.trim() || filling}
            className="wp-btn-sm shrink-0 disabled:opacity-40"
            data-tone="accent"
          >
            {filling ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {filling ? "Reading…" : "Fill fields"}
          </button>
        </div>

        {!parseResult && (
          <p className="mt-2 text-xs text-text-tertiary">
            Click Fill fields — Gemini reads messy phrasing and fills origin, destination,
            dates, budget, purpose, and more. If anything is missing, add it here and click
            again.
          </p>
        )}

        {parseResult && (
          <div className="mt-3 space-y-3">
            {parseResult.filled.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Check size={13} className="shrink-0 text-ok" strokeWidth={2.5} />
                {parseResult.filled.map((f) => (
                  <span key={f} className="wp-badge wp-badge-ok">{f}</span>
                ))}
                {parseResult.source && parseResult.source !== "regex" && (
                  <span className="wp-badge text-text-tertiary">via Gemini</span>
                )}
              </div>
            )}

            {parseResult.filled.length === 0 && parseResult.missing.length > 0 && (
              <p className="text-xs text-warn">
                Nothing recognizable yet — add the details below to the description and
                click Fill fields.
              </p>
            )}

            {parseResult.travelerHint && (
              <p className="text-xs text-text-tertiary">
                Mentioned {parseResult.travelerHint} travelers — select them below.
              </p>
            )}

            {missing.length === 0 ? (
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ember/15 ring-1 ring-ember/25">
                  <Sparkles size={15} className="text-ember" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    I have everything I need.
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {form.origin} → {form.destination}, {form.startDate}
                    {form.endDate ? ` to ${form.endDate}` : ""} ·{" "}
                    {partySize === 0
                      ? "no travelers selected yet"
                      : `${partySize} traveler${partySize === 1 ? "" : "s"}`}
                    . Create the trip and I&apos;ll draft the itinerary into the Travel Graph.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ember/15 ring-1 ring-ember/25">
                  <Sparkles size={15} className="text-ember" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {FIELD_PROMPT[missing[0]]}
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    Add it to the description above
                    {FIELD_HINT[missing[0]] ? ` (e.g. “${FIELD_HINT[missing[0]]}”)` : ""}{" "}
                    and click Fill fields
                    {missing.length > 1
                      ? ` — ${missing.length} answers still needed.`
                      : "."}
                  </p>
                  {missing.length > 1 && (
                    <ul className="mt-2 space-y-1">
                      {missing.slice(1).map((m) => (
                        <li key={m} className="text-xs text-text-tertiary">
                          Also: {FIELD_PROMPT[m]}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="wp-card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Departing from"
            required
            hint={originCode ? `Resolved to ${originCode}` : "City or airport code"}
            missing={!form.origin.trim()}
          >
            <input
              className="wp-input"
              placeholder="San Francisco or SFO"
              value={form.origin}
              onChange={(e) => set("origin", e.target.value)}
            />
          </Field>

          <Field label="Destination" required missing={!form.destination.trim()}>
            <input
              className="wp-input"
              placeholder="Lisbon, Portugal"
              value={form.destination}
              onChange={(e) => set("destination", e.target.value)}
            />
          </Field>

          <Field
            label="Start date"
            required
            hint="Every itinerary time is anchored to this"
            missing={!form.startDate}
          >
            <input
              type="date"
              className="wp-input"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </Field>

          <Field label="End date" hint="Optional — leave blank for a one-day trip">
            <input
              type="date"
              className="wp-input"
              min={form.startDate || undefined}
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Trip name" hint="Defaults to the destination">
          <input
            className="wp-input"
            placeholder="Engineering Offsite — Lisbon"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Budget (USD)">
            <input
              type="number"
              min={0}
              className="wp-input"
              placeholder="32000"
              value={form.budgetUsd}
              onChange={(e) => set("budgetUsd", e.target.value)}
            />
          </Field>

          <Field label="Cost center">
            <input
              className="wp-input"
              placeholder="ENG-1042"
              value={form.costCenter}
              onChange={(e) => set("costCenter", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Purpose" hint="Drives policy tier and approval routing">
          <select
            className="wp-select"
            value={form.purpose}
            onChange={(e) => set("purpose", e.target.value)}
          >
            <option value="OFFSITE">Team offsite</option>
            <option value="CONFERENCE">Conference</option>
            <option value="CLIENT_VISIT">Client visit</option>
            <option value="TRAINING">Training</option>
            <option value="RECRUITING">Recruiting</option>
          </select>
        </Field>
      </section>

      <TravelerPicker
        selectedIds={travelerIds}
        onToggle={(id) =>
          setTravelerIds((ids) =>
            ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
          )
        }
        adHoc={adHoc}
        onAddAdHoc={(t) =>
          setAdHoc((list) =>
            list.some((x) => x.email.toLowerCase() === t.email.toLowerCase())
              ? list
              : [...list, t],
          )
        }
        onRemoveAdHoc={(email) =>
          setAdHoc((list) => list.filter((x) => x.email !== email))
        }
      />

      <section className="wp-card overflow-hidden">
        {pending && <div className="wp-progress-indeterminate" role="progressbar" aria-label="Creating trip" />}

        <div className="p-6">
          {error && <p className="mb-4 text-sm text-err">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={submit}
              disabled={missing.length > 0 || pending}
              className="wp-cta px-6 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Creating…" : "Create trip"}
            </button>
            <span className="text-xs text-text-tertiary" aria-live="polite">
              {pending
                ? "Drafting itinerary into the Travel Graph…"
                : missing.length > 0
                  ? `${missing.length} required field${missing.length === 1 ? "" : "s"} left`
                  : partySize > 1
                    ? `${partySize} travelers · coordination enabled`
                    : partySize === 1
                      ? "1 traveler · solo trip"
                      : "No travelers selected yet — you can add them later"}
            </span>
          </div>

          {stages.length > 0 && (
            <ol className="mt-4 space-y-1.5 border-t border-white/8 pt-4">
              {stages.map((s, i) => {
                const done = i < stages.length - 1;
                return (
                  <li key={`${i}-${s}`} className="flex items-center gap-2.5 font-mono text-xs">
                    {done ? (
                      <Check size={12} className="shrink-0 text-ok" strokeWidth={2.5} />
                    ) : (
                      <span className="shrink-0 text-ember">
                        <span className="wp-dot" />
                        <span className="wp-dot" />
                        <span className="wp-dot" />
                      </span>
                    )}
                    <span className={done ? "text-text-tertiary" : "text-text-secondary"}>
                      {s}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  missing,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  missing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="wp-label flex items-center gap-1.5">
        {label}
        {required && (
          <span className={missing ? "text-warn" : "text-ok"} aria-label="required">
            *
          </span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}
