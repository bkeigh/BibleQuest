import Link from "next/link";
import { IconArrowRight } from "@/components/design-system/icons";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { cn } from "@/lib/utils/cn";

interface NewsletterLinkProps {
  className?: string;
}

/** Brings app users to the public newsletter form without interrupting their day. */
export function NewsletterLink({ className }: NewsletterLinkProps) {
  return (
    <Link
      href="/#newsletter"
      className={cn(
        "group relative isolate flex min-h-20 w-full items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border border-olive-300 bg-paper px-4 py-4 text-left text-graphite paper-shadow transition-all duration-300 [transition-timing-function:var(--ease-gentle)] hover:-translate-y-0.5 hover:border-accent/45 hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="ambient absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gold-300/20 blur-2xl [animation:var(--animate-twinkle)]"
      />
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent-surface ring-1 ring-accent/15">
        <PixelIcon name="scroll" size={44} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-[1.125rem] leading-tight">
          Join the BibleQuest newsletter
        </span>
        <span className="mt-1 block text-caption leading-snug text-ash">
          Get thoughtful updates, new features, and launch news.
        </span>
      </span>
      <IconArrowRight className="relative shrink-0 text-accent transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}
