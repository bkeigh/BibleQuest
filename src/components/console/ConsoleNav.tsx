"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBible,
  IconBookmark,
  IconHome,
  IconJourney,
  IconPrayer,
  IconQuest,
  IconSettings,
  IconSparkle,
} from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";
import { consoleHref } from "@/lib/console/paths";

const NAV_ITEMS = [
  { label: "Today", path: "/", icon: IconHome },
  { label: "Insights", path: "/insights", icon: IconSparkle },
  { label: "Releases", path: "/releases", icon: IconJourney },
  { label: "Content", path: "/content", icon: IconBible },
  { label: "Accounts", path: "/accounts", icon: IconPrayer },
  { label: "Billing", path: "/billing", icon: IconQuest },
  { label: "Flags", path: "/flags", icon: IconSettings },
  { label: "Audit", path: "/audit", icon: IconBookmark },
] as const;

/** Renders one responsive navigation model for clean and preview URLs. */
export function ConsoleNav({ cleanUrls }: { cleanUrls: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console" className="console-nav">
      {NAV_ITEMS.map((item) => {
        const href = consoleHref(item.path, cleanUrls);
        const internalPath = consoleHref(item.path, false);
        const active =
          item.path === "/"
            ? pathname === "/" || pathname === "/console"
            : pathname === item.path ||
              pathname === internalPath ||
              pathname.startsWith(`${internalPath}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "console-nav-link",
              active && "console-nav-link-active",
            )}
          >
            <Icon size={18} strokeWidth={1.7} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
