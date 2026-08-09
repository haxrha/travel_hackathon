"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, UserPlus, X } from "lucide-react";
import {
  directoryByDepartment,
  type DirectoryTraveler,
  type NewTravelerInput,
} from "@/lib/enterprise/directory";
import { initials } from "@/lib/enterprise/program";

/**
 * Picks the trip party: tick people already in the company directory, or add
 * someone who isn't in it yet with their standing travel details.
 *
 * Ad-hoc travelers are held here rather than written to the directory — a
 * contractor on one trip shouldn't silently become a permanent employee record.
 */
export default function TravelerPicker({
  selectedIds,
  onToggle,
  adHoc,
  onAddAdHoc,
  onRemoveAdHoc,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  adHoc: NewTravelerInput[];
  onAddAdHoc: (t: NewTravelerInput) => void;
  onRemoveAdHoc: (email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return directoryByDepartment()
      .map(([dept, people]) => {
        const matched = q
          ? people.filter(
              (p) =>
                p.name.toLowerCase().includes(q) ||
                p.email.toLowerCase().includes(q) ||
                p.homeCity.toLowerCase().includes(q) ||
                p.homeAirport.toLowerCase().includes(q) ||
                p.title.toLowerCase().includes(q),
            )
          : people;
        return [dept, matched] as const;
      })
      .filter(([, people]) => people.length > 0);
  }, [query]);

  const total = selectedIds.length + adHoc.length;

  return (
    <section className="wp-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="wp-section-title">Who&apos;s travelling</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Pick from the directory, or add someone new with their details.
          </p>
        </div>
        <span className={`wp-badge ${total > 0 ? "wp-badge-accent" : "wp-badge-neutral"}`}>
          {total} selected
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          {/* !pl-9: .wp-input sets padding as unlayered CSS, which outranks
              Tailwind's layered utilities — without the override the icon
              sits on top of the placeholder. */}
          <input
            className="wp-input !pl-9"
            placeholder="Search name, city, airport, or role"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="wp-btn-sm shrink-0"
          data-tone={adding ? undefined : "accent"}
        >
          {adding ? <X size={13} /> : <UserPlus size={13} />}
          {adding ? "Cancel" : "Add new traveler"}
        </button>
      </div>

      {adding && (
        <NewTravelerForm
          onAdd={(t) => {
            onAddAdHoc(t);
            setAdding(false);
          }}
        />
      )}

      {/* Ad-hoc travelers added in this session */}
      {adHoc.length > 0 && (
        <div className="mt-5">
          <div className="wp-eyebrow mb-2">Added for this trip</div>
          <div className="space-y-2">
            {adHoc.map((t) => (
              <div
                key={t.email}
                className="wp-card-sunken flex flex-wrap items-center gap-3 p-3.5"
              >
                <span className="wp-avatar">{initials(t.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">{t.name}</div>
                  <div className="truncate text-xs text-text-tertiary">
                    {t.title} · {t.department} · {t.homeCity || t.homeAirport}{" "}
                    <span className="font-mono">{t.homeAirport}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[...(t.dietary ?? []), ...(t.accessibility ?? [])].map((n) => (
                    <span key={n} className="wp-badge wp-badge-neutral">{n}</span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveAdHoc(t.email)}
                  className="wp-btn-sm"
                  aria-label={`Remove ${t.name}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Directory */}
      <div className="mt-5 space-y-5">
        {groups.map(([dept, people]) => (
          <div key={dept}>
            <div className="wp-eyebrow mb-2">{dept}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {people.map((p) => (
                <DirectoryRow
                  key={p.id}
                  person={p}
                  selected={selectedIds.includes(p.id)}
                  onToggle={() => onToggle(p.id)}
                />
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="py-6 text-center text-sm text-text-tertiary">
            Nobody matches “{query}”. Use <strong>Add new traveler</strong> to create them.
          </p>
        )}
      </div>
    </section>
  );
}

function DirectoryRow({
  person,
  selected,
  onToggle,
}: {
  person: DirectoryTraveler;
  selected: boolean;
  onToggle: () => void;
}) {
  const needs = [...(person.dietary ?? []), ...(person.accessibility ?? [])];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={`wp-card wp-card-interactive flex w-full items-center gap-3 p-3.5 text-left ${
        selected ? "wp-card-selected" : ""
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          selected
            ? "border-ember bg-ember text-accent-ink"
            : "border-white/20 text-transparent"
        }`}
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="wp-avatar">{initials(person.name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">
          {person.name}
        </span>
        <span className="block truncate text-xs text-text-tertiary">
          {person.title} · {person.homeCity}{" "}
          <span className="font-mono">{person.homeAirport}</span>
        </span>
        {needs.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {needs.map((n) => (
              <span key={n} className="wp-badge wp-badge-neutral">{n}</span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

const EMPTY: NewTravelerInput = {
  name: "",
  email: "",
  department: "",
  title: "",
  homeCity: "",
  homeAirport: "",
  dietary: [],
  accessibility: [],
};

function NewTravelerForm({ onAdd }: { onAdd: (t: NewTravelerInput) => void }) {
  const [f, setF] = useState<NewTravelerInput>(EMPTY);
  const [dietary, setDietary] = useState("");
  const [accessibility, setAccessibility] = useState("");

  const set = <K extends keyof NewTravelerInput>(k: K, v: NewTravelerInput[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  // Name, email and home airport are the minimum needed to price someone's travel.
  const valid =
    f.name.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(f.email) &&
    f.homeAirport.trim().length >= 3;

  function submit() {
    if (!valid) return;
    onAdd({
      ...f,
      name: f.name.trim(),
      email: f.email.trim(),
      homeAirport: f.homeAirport.trim().toUpperCase(),
      dietary: splitList(dietary),
      accessibility: splitList(accessibility),
    });
    setF(EMPTY);
    setDietary("");
    setAccessibility("");
  }

  return (
    <div className="wp-card-sunken mt-4 space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Full name" required>
          <input
            className="wp-input"
            placeholder="Jonas Becker"
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Labeled>
        <Labeled label="Work email" required>
          <input
            type="email"
            className="wp-input"
            placeholder="jonas@northwind.co"
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Labeled>
        <Labeled label="Home city">
          <input
            className="wp-input"
            placeholder="Berlin"
            value={f.homeCity}
            onChange={(e) => set("homeCity", e.target.value)}
          />
        </Labeled>
        <Labeled label="Home airport" required hint="IATA code — flights price from here">
          <input
            className="wp-input font-mono uppercase"
            placeholder="BER"
            maxLength={4}
            value={f.homeAirport}
            onChange={(e) => set("homeAirport", e.target.value)}
          />
        </Labeled>
        <Labeled label="Department">
          <input
            className="wp-input"
            placeholder="Engineering"
            value={f.department}
            onChange={(e) => set("department", e.target.value)}
          />
        </Labeled>
        <Labeled label="Title">
          <input
            className="wp-input"
            placeholder="Senior Engineer"
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Labeled>
        <Labeled label="Dietary needs" hint="Comma separated">
          <input
            className="wp-input"
            placeholder="vegetarian, no shellfish"
            value={dietary}
            onChange={(e) => setDietary(e.target.value)}
          />
        </Labeled>
        <Labeled label="Accessibility needs" hint="Comma separated">
          <input
            className="wp-input"
            placeholder="wheelchair-accessible room"
            value={accessibility}
            onChange={(e) => setAccessibility(e.target.value)}
          />
        </Labeled>
        <Labeled label="Seat preference">
          <select
            className="wp-select"
            value={f.seatPreference ?? ""}
            onChange={(e) =>
              set("seatPreference", (e.target.value || undefined) as NewTravelerInput["seatPreference"])
            }
          >
            <option value="">No preference</option>
            <option value="aisle">Aisle</option>
            <option value="window">Window</option>
          </select>
        </Labeled>
        <Labeled label="Known Traveler Number">
          <input
            className="wp-input"
            placeholder="KTN-98213765"
            value={f.knownTravelerNumber ?? ""}
            onChange={(e) => set("knownTravelerNumber", e.target.value)}
          />
        </Labeled>
      </div>

      <div className="flex items-center gap-3 border-t border-white/8 pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          className="wp-btn-sm disabled:cursor-not-allowed disabled:opacity-40"
          data-tone="accent"
        >
          <Plus size={13} /> Add traveler
        </button>
        {!valid && (
          <span className="text-xs text-text-tertiary">
            Name, a valid email, and a home airport are required
          </span>
        )}
      </div>
    </div>
  );
}

function Labeled({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="wp-label">
        {label}
        {required && <span className="ml-1 text-warn">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
