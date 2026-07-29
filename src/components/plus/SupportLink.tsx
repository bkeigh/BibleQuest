import Link from "next/link";
import { IconArrowRight } from "@/components/design-system/icons";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { cn } from "@/lib/utils/cn";
import { webCommerceAvailable } from "@/lib/platform/purchases";

interface SupportLinkProps {
  className?: string;
}

/** Gives the one-time support path the same prominent treatment as Home's verse card. */
export function SupportLink({ className }: SupportLinkProps) {
  if (!webCommerceAvailable()) return null;

  return (
    <Link
      href="/support"
      className={cn(
        "group relative isolate flex min-h-16 items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border border-evergreen-600 bg-evergreen-700 px-4 py-3 text-[#fdfbf3] paper-shadow-lg transition-all duration-300 [transition-timing-function:var(--ease-gentle)] hover:-translate-y-0.5 hover:bg-evergreen-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="ambient absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gold-300/15 blur-2xl [animation:var(--animate-twinkle)]"
      />
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#fdfbf3]/10 ring-1 ring-[#fdfbf3]/20">
        <PixelIcon name="heart" size={4} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-[1.125rem] leading-tight">
          Support BibleQuest
        </span>
        <span className="mt-1 block text-caption text-[#fdfbf3]/70">
          Help keep BibleQuest free and growing.
        </span>
      </span>
      <IconArrowRight className="relative shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}
