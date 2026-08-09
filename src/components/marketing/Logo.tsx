import Link from "next/link";
import { cn } from "@/lib/utils";

export function WayportLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 group", className)}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/5 ring-1 ring-white/15">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-5 w-5 text-white"
        >
          <path d="M4 8 L20 8" opacity={0.9} />
          <path d="M7 8 L7 20" opacity={0.9} />
          <path d="M17 8 L17 20" opacity={0.9} />
          <path d="M4 20 L20 20" opacity={0.9} />
        </svg>
      </span>
      <span className="font-display tracking-[0.32em] text-sm font-semibold text-white group-hover:text-white/90 transition">
        WAYPORT
      </span>
    </Link>
  );
}
