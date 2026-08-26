"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";
import { useStrings } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import {
  IconBible,
  IconHome,
  IconJourney,
  IconPrayer,
  IconQuest,
} from "@/components/design-system/icons";
import { isNativeTarget } from "@/lib/platform/target";

interface NavItem {
  href: string;
  key: "home" | "quests" | "bible" | "prayer" | "journey";
  Icon: typeof IconHome;
  exact?: boolean;
}

// Navigation uses quiet system-like symbols; 2.5D art stays in app content.
const ITEMS: NavItem[] = [
  { href: "/app", key: "home", Icon: IconHome, exact: true },
  { href: "/app/quests", key: "quests", Icon: IconQuest },
  { href: "/app/bible", key: "bible", Icon: IconBible },
  { href: "/app/prayer", key: "prayer", Icon: IconPrayer },
  { href: "/app/journey", key: "journey", Icon: IconJourney },
];

export function BottomNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const strings = useStrings();
  const shouldReduceMotion = useShouldReduceMotion();
  const nativeTarget = isNativeTarget();
  // The server renders English (no persisted language on the server), so
  // first client paint must match it — swap to the chosen language only
  // after hydration to avoid a text mismatch on every load.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const t = hydrated ? strings : en;

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      document.documentElement.style.removeProperty(
        "--app-bottom-nav-height",
      );
      return;
    }

    // Floating UI clears the rendered nav and its gap above the screen edge.
    const publishHeight = () => {
      const rect = nav.getBoundingClientRect();
      document.documentElement.style.setProperty(
        "--app-bottom-nav-height",
        `${Math.max(rect.height, window.innerHeight - rect.top)}px`,
      );
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(nav);
    window.addEventListener("resize", publishHeight);
    window.visualViewport?.addEventListener("resize", publishHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publishHeight);
      window.visualViewport?.removeEventListener("resize", publishHeight);
      document.documentElement.style.removeProperty(
        "--app-bottom-nav-height",
      );
    };
  }, [pathname]);

  // Journal composers are intentional, full-page writing spaces. Keeping the
  // tab bar onscreen competes with the editor and can be tapped accidentally
  // while the keyboard is open; Close/Done provide the clear exits here.
  // Seven Days Match is the same bargain in a different room: the board runs
  // to the bottom of the screen, and a tab bar under a match-three grid is a
  // mis-tap waiting to happen. Its own back link is the way out.
  if (
    pathname === "/app/prayer/new" ||
    pathname === "/app/prayer/reflection/new" ||
    pathname === "/app/games/seven-days"
  ) {
    return null;
  }

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      data-app-bottom-nav
      className={cn(
        "primary-bottom-nav app-glass-nav fixed z-40",
        nativeTarget
          ? "native-primary-bottom-nav inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] mx-auto max-w-lg overflow-hidden rounded-[2rem] border border-mist bg-parchment/92 paper-shadow-lg"
          : "inset-x-0 bottom-0 border-t border-mist bg-parchment pb-safe sm:bg-parchment/90 sm:backdrop-blur-md",
      )}
    >
      <ul
        className={cn(
          "primary-nav-list mx-auto flex max-w-lg items-stretch justify-around px-2",
          nativeTarget && "py-1",
        )}
      >
        {ITEMS.map(({ href, key, Icon, exact }) => {
          const label = t.nav[key];
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  // A second tap on the current tab mirrors native tab bars.
                  // Nested routes still navigate back to their tab root.
                  if (
                    pathname !== href ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  window.scrollTo({
                    top: 0,
                    behavior: shouldReduceMotion ? "auto" : "smooth",
                  });
                }}
                className={cn(
                  "primary-nav-link group relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-[1.35rem] px-1 py-1.5 text-[0.6875rem] transition-[color,background-color,transform] duration-300",
                  nativeTarget && active && "bg-accent-surface/60",
                  active ? "text-accent" : "text-ash hover:text-charcoal"
                )}
              >
                {/* The selected tab relies on tint and a quiet grouped fill,
                    matching modern iOS chrome without competing app art. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-7 w-10 items-center justify-center rounded-full transition-transform duration-300",
                    active
                      ? "scale-105"
                      : "opacity-80 group-hover:scale-105 group-hover:opacity-100",
                  )}
                >
                  <Icon size={23} strokeWidth={active ? 2 : 1.65} />
                </span>
                <span
                  className={cn(
                    "primary-nav-label whitespace-nowrap leading-tight",
                    active && "font-medium",
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
