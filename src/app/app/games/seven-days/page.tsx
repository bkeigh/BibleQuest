import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/design-system/icons";
import { SevenDaysMatchScreen } from "@/components/games/seven-days/SevenDaysMatchScreen";
import { GREEN_FEATURES } from "@/lib/features/green";

export const metadata: Metadata = {
  title: "Seven Days Match",
  description:
    "A match-three journey through Genesis 1: gather the day, answer one question from the passage, and open the next level.",
};

/**
 * The game gets the screen.
 *
 * The tab bar is hidden here (see BottomNav) so the board can breathe, and the
 * only chrome is a single way back — the reader should feel like they stepped
 * into a game without ever wondering how to step out of it.
 */
export default function SevenDaysMatchPage() {
  if (!GREEN_FEATURES.games) notFound();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-safe pb-6 sm:px-8">
      <div className="flex min-h-14 items-center justify-between gap-3 pt-2">
        <Link
          href="/app/games"
          className="inline-flex min-h-11 items-center gap-1.5 px-1 text-small text-ash transition-colors hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IconArrowLeft size={16} /> Arcade
        </Link>
        <p className="font-art-label text-caption uppercase tracking-[0.08em] text-gilt">
          Seven Days Match
        </p>
      </div>
      <main className="flex min-h-0 flex-1 flex-col pt-2">
        <SevenDaysMatchScreen />
      </main>
    </div>
  );
}
