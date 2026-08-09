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
  trips: { src: "/images/mountain-dusk.jpg", renderMode: "dither", tint: "#e8905a", cellSize: 9, height: "200px" },
  concierge: { src: "/images/sunset-horizon.jpg", renderMode: "characters", tint: "#f4a261", cellSize: 10, height: "200px" },
  explore: { src: "/images/lake-golden.jpg", renderMode: "characters", tint: "#c45c26", cellSize: 9, height: "240px" },
  inbox: { src: "/images/sunset-horizon.jpg", renderMode: "dither", tint: "#e8905a", cellSize: 8, height: "200px" },
  wallet: { src: "/images/sunset-forest.jpg", renderMode: "dots", tint: "#e76f51", cellSize: 10, height: "200px" },
  travelers: { src: "/images/lake-golden.jpg", renderMode: "hearts", tint: "#d4845a", cellSize: 12, height: "200px" },
  money: { src: "/images/mountain-dusk.jpg", renderMode: "dither", tint: "#f0b45a", cellSize: 8, height: "200px" },
  rewards: { src: "/images/sunset-forest.jpg", renderMode: "characters", tint: "#e8905a", cellSize: 11, height: "200px" },
  alerts: { src: "/images/sunset-horizon.jpg", renderMode: "dots", tint: "#e07a6a", cellSize: 9, height: "200px" },
  dna: { src: "/images/mountain-dusk.jpg", renderMode: "hearts", tint: "#e76f51", cellSize: 11, height: "200px" },
  autonomy: { src: "/images/sunset-forest.jpg", renderMode: "dither", tint: "#c48a62", cellSize: 9, height: "200px" },
  sandbox: { src: "/images/lake-golden.jpg", renderMode: "characters", tint: "#f4a261", cellSize: 10, height: "200px" },
  advisor: { src: "/images/mountain-dusk.jpg", renderMode: "dither", tint: "#e8905a", cellSize: 8, height: "200px" },
  hospitality: { src: "/images/sunset-horizon.jpg", renderMode: "dots", tint: "#d4845a", cellSize: 10, height: "200px" },
  account: { src: "/images/sunset-forest.jpg", renderMode: "characters", tint: "#e8905a", cellSize: 9, height: "200px" },
  default: { src: "/images/sunset-horizon.jpg", renderMode: "dither", tint: "#e8905a", cellSize: 9, height: "200px" },
};

/**
 * Compact page header for the product surface.
 *
 * The ASCII texture is kept as a right-edge accent rather than a full-bleed
 * banner — inside the app the priority is getting dense content above the fold,
 * so this is a band, not a hero.
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
    <header className="wp-card relative overflow-hidden">
      {/* Texture bleeds in from the right and fades out before the text. */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-45 md:block"
        style={{ maskImage: "linear-gradient(to right, transparent, black 65%)", WebkitMaskImage: "linear-gradient(to right, transparent, black 65%)" }}
        aria-hidden
      >
        <InkGarden
          height="100%"
          renderMode={v.renderMode}
          src={v.src}
          tint={v.tint}
          cellSize={v.cellSize}
          animIntensity={30}
        />
      </div>

      <div className="relative flex flex-wrap items-end justify-between gap-4 p-6 md:p-7">
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
