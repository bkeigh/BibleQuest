"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";
import { useStrings } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import {
  ArtIcon,
  type ArtSpriteName,
} from "@/components/design-system/ArtIcon";

interface NavItem {
  href: string;
  key: "home" | "quests" | "bible" | "prayer" | "journey";
  sprite: ArtSpriteName;
  exact?: boolean;
}

// Primary destinations use the reviewed 2.5D art instead of generic symbols.
const ITEMS: NavItem[] = [
  { href: "/app", key: "home", sprite: "sun", exact: true },
  { href: "/app/quests", key: "quests", sprite: "map" },
  { href: "/app/bible", key: "bible", sprite: "open-book" },
  { href: "/app/prayer", key: "prayer", sprite: "hands" },
  { href: "/app/journey", key: "journey", sprite: "tree" },
];

export function BottomNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const strings = useStrings();
  const shouldReduceMotion = useShouldReduceMotion();
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

    // Floating UI anchors to the rendered nav, including device safe area.
    const publishHeight = () => {
      document.documentElement.style.setProperty(
        "--app-bottom-nav-height",
        `${nav.getBoundingClientRect().height}px`,
      );
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(nav);
    return () => {
      observer.disconnect();
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
      className="app-glass-nav fixed inset-x-0 bottom-0 z-40 border-t border-mist bg-parchment pb-safe sm:bg-parchment/90 sm:backdrop-blur-md"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {ITEMS.map(({ href, key, sprite, exact }) => {
          const label = t.nav[key];
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
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
                  "group relative flex min-h-[44px] flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[0.6875rem] transition-colors duration-300",
                  active ? "text-accent" : "text-ash hover:text-charcoal"
                )}
              >
                {/* Crisp active indicator: a hard-edged bar flush with
                    the top hairline — deliberately unrounded. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 h-[3px] w-5 bg-accent transition-opacity duration-300",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
                <span
                  aria-hidden="true"
                  data-primary-nav-art={sprite}
                  className={cn(
                    "flex h-8 w-10 items-center justify-center rounded-full transition-all duration-300",
                    active
                      ? "scale-105 bg-accent-surface/75 opacity-100"
                      : "opacity-70 group-hover:scale-105 group-hover:opacity-100",
                  )}
                >
                  <ArtIcon name={sprite} size={27} />
                </span>
                <span className={cn(active && "font-medium")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
