"use client";

import { useState } from "react";

/**
 * Client-side tab shell. Panels are rendered by the server and passed in as
 * children, so switching tabs costs nothing and the itinerary stays a server
 * component.
 */
export default function TripTabs({
  tabs,
}: {
  tabs: { id: string; label: string; badge?: string; panel: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Trip sections"
        className="flex flex-wrap gap-1 border-b border-white/10"
      >
        {tabs.map((t) => {
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm transition ${
                on
                  ? "text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="wp-badge wp-badge-warn !px-1.5 !py-0 !text-[10px]">
                  {t.badge}
                </span>
              )}
              <span
                className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ember transition-opacity ${
                  on ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{current?.panel}</div>
    </div>
  );
}
