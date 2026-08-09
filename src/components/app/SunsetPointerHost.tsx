"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Applies the pointer-tracking multi-layer blend to a host element
 * (matches the body + pointermove pattern you specified).
 */
export default function SunsetPointerHost({
  className,
  children,
  plain = false,
}: {
  className?: string;
  children: React.ReactNode;
  /** Skip sunset blend (e.g. Map OS needs a clean canvas host). */
  plain?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (plain) return;
    const el = ref.current;
    if (!el) return;

    // Respect the OS setting — no pointer parallax at all when motion is reduced.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    // Target vs rendered position. The gap is closed a little each frame, so the
    // background eases toward the cursor instead of snapping with it.
    let targetX = 0;
    let targetY = 0;
    let renderX = 0;
    let renderY = 0;
    let frame = 0;

    const onMove = (e: PointerEvent) => {
      const { top, left, width, height } = el.getBoundingClientRect();
      // Normalized to roughly [-1, 1] so the CSS travel cap is resolution-independent.
      targetX = (e.clientX - left - width / 2) / (width / 2);
      targetY = (e.clientY - top - height / 2) / (height / 2);
    };

    const tick = () => {
      // 0.045 ≈ a ~1s settle — slow enough that the motion reads as ambient drift.
      renderX += (targetX - renderX) * 0.045;
      renderY += (targetY - renderY) * 0.045;
      el.style.setProperty("--posX", renderX.toFixed(4));
      el.style.setProperty("--posY", renderY.toFixed(4));
      frame = requestAnimationFrame(tick);
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      el.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [plain]);

  return (
    <main
      ref={ref}
      className={cn(
        "relative flex-1 overflow-y-auto",
        plain ? "bg-[#0c0806]" : "wp-sunset-host",
        className,
      )}
    >
      {children}
    </main>
  );
}
