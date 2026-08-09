"use client";

/**
 * Ink Garden — Canvas2D ASCII / dither effect (21st.dev-inspired).
 * Tuned for sunset rose/ember tones over a landscape photo.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type InkGardenProps = {
  src?: string;
  className?: string;
  height?: string;
  cellSize?: number;
  renderMode?: "dither" | "characters" | "dots" | "hearts";
  tint?: string;
  animIntensity?: number;
  children?: React.ReactNode;
};

const CHARSET = " .:-=+*#%@";

export default function InkGarden({
  src = "/images/sunset-horizon.jpg",
  className,
  height = "280px",
  cellSize = 9,
  renderMode = "dither",
  tint = "#e8905a",
  animIntensity = 60,
  children,
}: InkGardenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;

    let raf = 0;
    let running = true;

    const hexToRgb = (hex: string) => {
      const h = hex.replace("#", "");
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    };
    const tintRgb = hexToRgb(tint);

    const draw = (t: number) => {
      if (!running) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 4 || h < 4) {
        raf = requestAnimationFrame(draw);
        return;
      }
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Sample source into offscreen
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d")!;
      octx.fillStyle = "#1a100c";
      octx.fillRect(0, 0, w, h);
      if (img.complete && img.naturalWidth) {
        const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        octx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
      const data = octx.getImageData(0, 0, w, h).data;

      ctx.fillStyle = "#120c09";
      ctx.fillRect(0, 0, w, h);

      const pulse = 1 + (Math.sin(t * 0.0025) * animIntensity) / 400;
      const contrast = 1.58;

      for (let y = 0; y < h; y += cellSize) {
        for (let x = 0; x < w; x += cellSize) {
          let r = 0, g = 0, b = 0, n = 0;
          for (let dy = 0; dy < cellSize; dy++) {
            for (let dx = 0; dx < cellSize; dx++) {
              const px = x + dx;
              const py = y + dy;
              if (px >= w || py >= h) continue;
              const i = (py * w + px) * 4;
              r += data[i];
              g += data[i + 1];
              b += data[i + 2];
              n++;
            }
          }
          if (!n) continue;
          r /= n; g /= n; b /= n;
          let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          lum = ((lum - 0.5) * contrast + 0.5) * pulse;
          lum = Math.max(0, Math.min(1, lum));

          const mr = Math.round(r * 0.55 + tintRgb.r * 0.45);
          const mg = Math.round(g * 0.55 + tintRgb.g * 0.45);
          const mb = Math.round(b * 0.55 + tintRgb.b * 0.45);
          const alpha = 0.35 + lum * 0.65;

          if (renderMode === "characters") {
            const ch = CHARSET[Math.min(CHARSET.length - 1, Math.floor(lum * CHARSET.length))];
            ctx.fillStyle = `rgba(${mr},${mg},${mb},${alpha})`;
            ctx.font = `${cellSize}px ui-monospace, monospace`;
            ctx.fillText(ch, x, y + cellSize - 1);
          } else if (renderMode === "dots") {
            ctx.fillStyle = `rgba(${mr},${mg},${mb},${alpha})`;
            const rad = (cellSize / 2) * lum;
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, Math.max(0.5, rad), 0, Math.PI * 2);
            ctx.fill();
          } else if (renderMode === "hearts") {
            if (lum < 0.35) continue;
            ctx.fillStyle = `rgba(${mr},${mg},${mb},${alpha})`;
            ctx.font = `${Math.max(6, cellSize * lum)}px serif`;
            ctx.fillText("♥", x, y + cellSize - 1);
          } else {
            // dither: density of small rects
            const density = Math.floor(lum * 6);
            ctx.fillStyle = `rgba(${mr},${mg},${mb},${alpha})`;
            for (let i = 0; i < density; i++) {
              const ox = (i % 3) * (cellSize / 3);
              const oy = Math.floor(i / 3) * (cellSize / 3);
              ctx.fillRect(x + ox, y + oy, cellSize / 3.2, cellSize / 3.2);
            }
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };

    img.onload = () => {
      raf = requestAnimationFrame(draw);
    };
    if (img.complete) raf = requestAnimationFrame(draw);

    const ro = new ResizeObserver(() => {
      /* next frame redraws at new size */
    });
    ro.observe(container);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [src, cellSize, renderMode, tint, animIntensity]);

  return (
    <div ref={containerRef} style={{ height }} className={cn("relative w-full overflow-hidden", className)}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}
