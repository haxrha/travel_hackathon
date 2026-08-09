"use client";

import InkGarden from "@/components/ui/ink-garden";
import type { InkGardenProps } from "@/components/ui/ink-garden";

type Variant = {
  src: string;
  renderMode: InkGardenProps["renderMode"];
  tint: string;
  cellSize: number;
  height: string;
};

const VARIANTS: Record<string, Variant> = {
  trips: { src: "/images/mountain-dusk.jpg", renderMode: "dither", tint: "#e8905a", cellSize: 9, height: "220px" },
  concierge: { src: "/images/sunset-horizon.jpg", renderMode: "characters", tint: "#f4a261", cellSize: 10, height: "220px" },
  explore: { src: "/images/lake-golden.jpg", renderMode: "characters", tint: "#c45c26", cellSize: 9, height: "260px" },
  inbox: { src: "/images/sunset-horizon.jpg", renderMode: "dither", tint: "#e8905a", cellSize: 8, height: "220px" },
  wallet: { src: "/images/sunset-forest.jpg", renderMode: "dots", tint: "#e76f51", cellSize: 10, height: "220px" },
  travelers: { src: "/images/lake-golden.jpg", renderMode: "hearts", tint: "#d4845a", cellSize: 12, height: "220px" },
  money: { src: "/images/mountain-dusk.jpg", renderMode: "dither", tint: "#f0b45a", cellSize: 8, height: "220px" },
  rewards: { src: "/images/sunset-forest.jpg", renderMode: "characters", tint: "#e8905a", cellSize: 11, height: "240px" },
  alerts: { src: "/images/sunset-horizon.jpg", renderMode: "dots", tint: "#e07a6a", cellSize: 9, height: "220px" },
  dna: { src: "/images/mountain-dusk.jpg", renderMode: "hearts", tint: "#e76f51", cellSize: 11, height: "220px" },
  autonomy: { src: "/images/sunset-forest.jpg", renderMode: "dither", tint: "#c48a62", cellSize: 9, height: "220px" },
  sandbox: { src: "/images/lake-golden.jpg", renderMode: "characters", tint: "#f4a261", cellSize: 10, height: "220px" },
  advisor: { src: "/images/mountain-dusk.jpg", renderMode: "dither", tint: "#e8905a", cellSize: 8, height: "220px" },
  hospitality: { src: "/images/sunset-horizon.jpg", renderMode: "dots", tint: "#d4845a", cellSize: 10, height: "220px" },
  account: { src: "/images/sunset-forest.jpg", renderMode: "characters", tint: "#e8905a", cellSize: 9, height: "220px" },
  default: { src: "/images/sunset-horizon.jpg", renderMode: "dither", tint: "#e8905a", cellSize: 9, height: "220px" },
};

/**
 * Page header with full-bleed ASCII texture filling the entire card.
 * Copy sits above a soft scrim so type stays readable.
 */
export default function PageAsciiHero({
  title,
  eyebrow,
  subtitle,
  variant = "default",
  actions,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  variant?: keyof typeof VARIANTS;
  /** Optional right-aligned controls (buttons, filters). */
  actions?: React.ReactNode;
}) {
  const v = VARIANTS[variant] ?? VARIANTS.default;
  return (
    <header
      className="wp-card relative overflow-hidden"
      style={{ minHeight: v.height }}
    >
      {/* Full-bleed ASCII — fills the whole header surface. */}
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
        <InkGarden
          height="100%"
          className="h-full w-full"
          renderMode={v.renderMode}
          src={v.src}
          tint={v.tint}
          cellSize={v.cellSize}
          animIntensity={34}
        />
      </div>

      {/* Readable band over the texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(105deg, rgba(12,10,9,0.82) 0%, rgba(12,10,9,0.55) 42%, rgba(12,10,9,0.22) 78%, rgba(12,10,9,0.08) 100%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 flex min-h-[inherit] flex-wrap items-end justify-between gap-4 p-6 md:p-8">
        <div className="min-w-0">
          {eyebrow && <p className="wp-eyebrow">{eyebrow}</p>}
          <h1 className="font-display mt-1.5 text-2xl font-semibold tracking-tight md:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 max-w-xl text-sm text-text-secondary">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
