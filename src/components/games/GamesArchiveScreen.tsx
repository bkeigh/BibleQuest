"use client";

import { useMemo } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import { GentleLink } from "@/components/design-system/GentleButton";
import { IconArrowLeft, IconClock } from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import { gamePuzzles } from "@/data/games";
import { getGameAccess } from "@/lib/games/access";
import { archivedGameHref } from "@/lib/games/links";
import { usePlus } from "@/lib/billing/usePlus";
import { GREEN_FEATURES } from "@/lib/features/green";

/** Optional Plus breadth is visible without interrupting the free daily study. */
export function GamesArchiveScreen() {
  const plus = usePlus();
  const access = getGameAccess("archive", plus.isPlus);
  const themes = useMemo(() => {
    const grouped = new Map<string, typeof gamePuzzles>();
    const enabledPuzzles = gamePuzzles.filter((puzzle) =>
      puzzle.kind === "connections"
        ? GREEN_FEATURES.scriptureConnections
        : GREEN_FEATURES.bibleTimeline,
    );
    for (const puzzle of enabledPuzzles) {
      grouped.set(puzzle.themePack, [
        ...(grouped.get(puzzle.themePack) ?? []),
        puzzle,
      ]);
    }
    return [...grouped.entries()];
  }, []);

  return (
    <>
      <PageHeader
        title="Game Archive"
        subtitle="Revisit a study by passage or theme."
      />
      <PageContainer className="pb-8 pt-4">
        <GentleLink href="/app/games" variant="text" size="sm">
          <IconArrowLeft size={17} />
          Today&apos;s free game
        </GentleLink>
        {!GREEN_FEATURES.games ? (
          <PaperCard variant="quiet" padding="lg" className="mt-4">
            <h2 className="font-display text-subheading text-graphite">
              Scripture Games are resting
            </h2>
            <p className="mt-2 text-body text-charcoal">
              A release setting has paused the game library. The Bible and
              quests remain ready.
            </p>
          </PaperCard>
        ) : plus.loading ? (
          <PaperCard variant="quiet" padding="lg" className="mt-4" aria-busy>
            <p className="text-body text-ash">Checking archive access…</p>
          </PaperCard>
        ) : (
          <>
            <PaperCard variant="atmospheric" padding="lg" className="mt-4">
              <p className="font-pixel text-[0.9375rem] uppercase tracking-[0.06em] text-gilt">
                Optional Plus library
              </p>
              <h2 className="mt-3 font-display text-[1.5rem] text-graphite">
                More paths into the same passages
              </h2>
              <p className="mt-2 text-body text-charcoal">{access.message}</p>
              {!access.allowed && (
                <GentleLink href="/app/plus" variant="outline" className="mt-5">
                  See what Plus supports
                </GentleLink>
              )}
            </PaperCard>

            <div className="mt-7 space-y-8">
              {themes.map(([theme, puzzles]) => (
                <section key={theme} aria-labelledby={`theme-${theme}`}>
                  <h2
                    id={`theme-${theme}`}
                    className="font-display text-subheading capitalize text-graphite"
                  >
                    {theme.replaceAll("-", " ")}
                  </h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {puzzles.map((puzzle) => (
                      <PaperCard
                        key={puzzle.id}
                        as="article"
                        variant="paper"
                        padding="md"
                      >
                        <p className="text-caption font-medium uppercase tracking-[0.08em] text-accent">
                          {puzzle.kind === "connections"
                            ? "Scripture Connections"
                            : "Bible Timeline"}
                        </p>
                        <h3 className="mt-2 font-display text-subheading text-graphite">
                          {puzzle.title}
                        </h3>
                        <p className="mt-2 text-small text-ash">
                          {puzzle.description}
                        </p>
                        <p className="mt-3 inline-flex items-center gap-1.5 text-caption text-ash">
                          <IconClock size={15} /> About {puzzle.estimatedMinutes}{" "}
                          minutes
                        </p>
                        {access.allowed ? (
                          <GentleLink
                            href={archivedGameHref(puzzle.id)}
                            variant="outline"
                            size="sm"
                            className="mt-4"
                          >
                            Revisit study
                          </GentleLink>
                        ) : (
                          <p className="mt-4 text-caption font-medium text-gilt">
                            Archive access is included with Plus.
                          </p>
                        )}
                      </PaperCard>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </PageContainer>
    </>
  );
}
