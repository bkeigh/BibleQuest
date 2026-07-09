"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { GentleLink } from "@/components/design-system/GentleButton";
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/brand/bq-logo.svg"
            alt=""
            width={22}
            height={28}
            priority
            className="h-[26px] w-auto"
          />
          <span className="font-display text-[1.125rem] text-graphite">
            BibleQuest
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[0.875rem] text-charcoal transition-colors hover:text-accent"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <GentleLink variant="primary" size="sm" href="/onboarding">
            Get BibleQuest
          </GentleLink>
        </div>

        <button
          type="button"
          className="-my-2 -mr-2 flex h-11 w-11 items-center justify-center rounded-full md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="marketing-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
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
        <div
          id="marketing-mobile-menu"
          className="pointer-events-auto fixed inset-x-4 top-20 rounded-[var(--radius-card-lg)] border border-mist bg-paper p-4 paper-shadow-lg md:hidden"
        >
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
              variant="primary"
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
