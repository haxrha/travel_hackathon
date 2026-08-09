"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { WayportLogo } from "./Logo";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/story", label: "Why WAYPORT" },
  { href: "/app/trips", label: "Trips" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * Marketing nav — demo-safe (no Clerk required).
 * With real Clerk keys, "Get started" still goes to /sign-up.
 */
export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Solid backing once the hero scrolls under the bar, so links stay legible.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the page while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
          scrolled
            ? "border-b border-white/10 bg-sky-950/80 backdrop-blur-xl"
            : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">
          <WayportLogo />

          <nav className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-text-secondary transition hover:text-text-primary"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/app"
              className="text-sm text-text-secondary transition hover:text-text-primary"
            >
              Sign in
            </Link>
            <Link href="/app/trips" className="wp-cta px-5 py-2.5 text-sm">
              Open WAYPORT
            </Link>
          </div>

          <button
            aria-label="Open menu"
            aria-expanded={open}
            className="wp-icon-btn text-white/80 hover:text-white md:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu size={20} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md md:hidden"
          onClick={() => setOpen(false)}
        >
          <nav
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col gap-6 border-l border-white/10 bg-sky-950/95 p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <button
                className="wp-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <Link href="/" className="font-display text-3xl" onClick={() => setOpen(false)}>
              Home
            </Link>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-lg text-text-secondary hover:text-white"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}

            <div className="mt-auto space-y-3">
              <Link
                href="/app/trips"
                className="wp-cta block px-6 py-3.5 text-center"
                onClick={() => setOpen(false)}
              >
                Open WAYPORT
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
