"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useStrings } from "@/lib/i18n";
import {
  IconHome,
  IconQuest,
  IconBible,
  IconPrayer,
  IconJourney,
} from "@/components/design-system/icons";

interface NavItem {
  href: string;
  key: "home" | "quests" | "bible" | "prayer" | "journey";
  Icon: typeof IconHome;
  exact?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/app", key: "home", Icon: IconHome, exact: true },
  { href: "/app/quests", key: "quests", Icon: IconQuest },
  { href: "/app/bible", key: "bible", Icon: IconBible },
  { href: "/app/prayer", key: "prayer", Icon: IconPrayer },
  { href: "/app/journey", key: "journey", Icon: IconJourney },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useStrings();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-mist bg-parchment/90 backdrop-blur-md pb-safe"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {ITEMS.map(({ href, key, Icon, exact }) => {
          const label = t.nav[key];
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[44px] flex-col items-center gap-1 px-1 pt-2.5 pb-2 text-[0.6875rem] transition-colors duration-300",
                  active ? "text-accent" : "text-ash hover:text-charcoal"
                )}
              >
                {/* Pixel-crisp active indicator: a hard-edged bar flush with
                    the top hairline — deliberately unrounded. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 h-[3px] w-5 bg-accent transition-opacity duration-300",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
                <Icon size={23} strokeWidth={active ? 1.9 : 1.6} />
                <span className={cn(active && "font-medium")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
