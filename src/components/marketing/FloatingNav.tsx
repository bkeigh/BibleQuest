"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconClose } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/#how", label: "How it works" },
  { href: "/writing", label: "Writing" },
  { href: "/churches", label: "Churches" },
  { href: "/pricing", label: "Pricing" },
];

export function FloatingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-safe">
      <nav
        className={cn(
          "pointer-events-auto mt-3 flex w-full max-w-3xl items-center justify-between gap-3 rounded-full border px-4 py-2.5 transition-all duration-500",
          scrolled
            ? "border-mist bg-parchment/85 backdrop-blur-md paper-shadow"
            : "border-transparent bg-transparent"
        )}
      >
        <Link href="/" className="flex items-center gap-2">
          <PixelIcon name="candle" size={4} animate />
          <span className="font-display text-[1.125rem] text-graphite">
            BibleQuest
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[0.875rem] text-charcoal transition-colors hover:text-olive-700"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <GentleLink variant="dark" size="sm" href="/onboarding">
            Get BibleQuest
          </GentleLink>
        </div>

        <button
          className="md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
        >
          {open ? (
            <IconClose />
          ) : (
            <span className="flex flex-col gap-1.5">
              <span className="block h-0.5 w-5 bg-charcoal" />
              <span className="block h-0.5 w-5 bg-charcoal" />
            </span>
          )}
        </button>
      </nav>

      {/* Mobile sheet */}
      {open && (
        <div className="pointer-events-auto fixed inset-x-4 top-20 rounded-[var(--radius-card-lg)] border border-mist bg-paper p-4 paper-shadow-lg md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-button)] px-3 py-3 text-[1rem] text-charcoal hover:bg-linen"
              >
                {l.label}
              </Link>
            ))}
            <GentleLink
              variant="dark"
              size="md"
              href="/onboarding"
              fullWidth
              className="mt-2"
            >
              Get BibleQuest
            </GentleLink>
          </div>
        </div>
      )}
    </div>
  );
}
