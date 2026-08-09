"use client";

import { useEffect, useRef } from "react";

/**
 * Pointer-tracking multi-layer blend background (sunset hues).
 * Listens on the parent main so UI stays clickable.
 */
export default function SunsetPointerBg() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const onMove = (e: PointerEvent) => {
      const { top, left, width, height } = host.getBoundingClientRect();
      el.style.setProperty("--posX", String(e.clientX - left - width / 2));
      el.style.setProperty("--posY", String(e.clientY - top - height / 2));
    };
    host.addEventListener("pointermove", onMove);
    return () => host.removeEventListener("pointermove", onMove);
  }, []);

  return <div ref={ref} className="wp-sunset-pointer" aria-hidden />;
}
