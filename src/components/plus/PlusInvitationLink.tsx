import Link from "next/link";
import { IconArrowRight } from "@/components/design-system/icons";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { cn } from "@/lib/utils/cn";

interface PlusInvitationLinkProps {
  className?: string;
  description: string;
  href: string;
  title: string;
}

/** Shared gold Plus invitation used across the app and marketing site. */
export function PlusInvitationLink({
  className,
  description,
  href,
  title,
}: PlusInvitationLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative isolate flex min-h-[4.75rem] w-full items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border border-gold-700/45 bg-[linear-gradient(135deg,var(--color-gold-300),var(--color-gold-500))] px-4 py-3 text-left text-[#2c2618] paper-shadow-lg transition-all duration-300 [transition-timing-function:var(--ease-gentle)] hover:-translate-y-0.5 hover:brightness-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="ambient absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/25 blur-2xl [animation:var(--animate-twinkle)]"
      />
      <span className="relative flex shrink-0 items-center justify-center">
        <ArtIcon name="crown" size={52} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-[1.125rem] leading-tight">
          {title}
        </span>
        <span className="mt-1 block text-caption leading-snug text-[#2c2618]/75">
          {description}
        </span>
      </span>
      <IconArrowRight className="relative shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}
