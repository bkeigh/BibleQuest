import Link from "next/link";
import { IconArrowRight } from "@/components/design-system/icons";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { cn } from "@/lib/utils/cn";
import { webCommerceAvailable } from "@/lib/platform/purchases";

interface SupportLinkProps {
  className?: string;
}

/** Keeps one-time support visible without competing with the primary Scripture action. */
export function SupportLink({ className }: SupportLinkProps) {
  if (!webCommerceAvailable()) return null;

  return (
    <Link
      href="/support"
      data-paper-variant="quiet"
      className={cn(
        "app-glass-surface group relative isolate flex min-h-20 items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border border-gold-500/45 bg-paper/70 px-4 py-4 text-graphite paper-shadow transition-all duration-300 [transition-timing-function:var(--ease-gentle)] hover:-translate-y-0.5 hover:border-gold-500/65 hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="ambient absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gold-300/15 blur-2xl [animation:var(--animate-twinkle)]"
      />
      {/* The shared art frame keeps this heavily cropped basket centred while
          the banner reserves the same compact square as every other row. */}
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <ArtIcon name="service-basket" size={52} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-[1.125rem] leading-tight">
          Support BibleQuest
        </span>
        <span className="mt-1 block text-caption text-charcoal">
          Make a voluntary one-time contribution.
        </span>
      </span>
      <IconArrowRight className="relative shrink-0 text-accent transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}
