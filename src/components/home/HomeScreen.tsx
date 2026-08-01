"use client";

/**
 * The daily landing screen. It composes the local-first QuestOS state into one
 * calm sequence: welcome and candle, quests, growth, and
 * private next steps. Scripture discovery stays one tap away without competing
 * with the quests that anchor the daily experience.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  useQuestOS,
  selectStreak,
} from "@/lib/questos/store";
import { calculateTreeState, stageProgress } from "@/lib/questos/growth-engine";
import {
  activeQuestAssignments,
  formatQuestWindowRemaining,
  isQuestWindowOpen,
} from "@/lib/questos/quest-engine";
import { timeOfDay, toDateKey } from "@/lib/utils/dates";
import { useStrings, fmt } from "@/lib/i18n";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { riseIn } from "@/lib/motion";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { AccountPrompt } from "@/components/account/AccountPrompt";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { CATEGORY_SPRITE, PixelIcon } from "@/components/design-system/PixelIcon";
import { Avatar } from "@/components/profile/Avatar";
import { StreakCard } from "@/components/home/StreakCard";
import {
  IconArrowRight,
  IconChevronRight,
  IconSettings,
} from "@/components/design-system/icons";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { questBySlug } from "@/data/seed/quests";
import { usePlus } from "@/lib/billing/usePlus";
import { ExplorePlusLink } from "@/components/plus/ExplorePlusLink";
import { SupportLink } from "@/components/plus/SupportLink";
import { NewsletterLink } from "@/components/newsletter/NewsletterLink";
import { profileAvatarMarker } from "@/lib/utils/avatar";
import { cn } from "@/lib/utils/cn";
import { TodayFormation } from "@/components/home/TodayFormation";
import { RhythmTodayCard } from "@/components/rhythm/RhythmTodayCard";
import { PlusFeatureDialog } from "@/components/plus/PlusFeatureDialog";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";

function HomeInner() {
  const profile = useQuestOS((s) => s.profile);
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const readingPosition = useQuestOS((s) => s.readingPosition);
  const assignments = useQuestOS((s) => s.assignments);
  const { isPlus } = usePlus();
  const [shepherdDialogOpen, setShepherdDialogOpen] = useState(false);
  // The candle. Stable ref — the stored object itself.
  const streak = useQuestOS(selectStreak);
  // Keep day-scoped quest suggestions and rolling countdowns fresh when a
  // long-lived tab crosses midnight or returns from the background.
  const [dayKey, setDayKey] = useState(() => toDateKey());
  const [now, setNow] = useState(() => Date.now());

  // Watch for a local day rollover: re-check on an interval, on focus, and on
  // visibility change. setDayKey is a no-op when the day hasn't changed.
  useEffect(() => {
    function check() {
      setNow(Date.now());
      const k = toDateKey();
      setDayKey((prev) => (prev === k ? prev : k));
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const interval = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.clearInterval(interval);
    };
  }, []);

  const tree = useMemo(() => calculateTreeState(growthEvents), [growthEvents]);
  const progress = useMemo(() => stageProgress(tree), [tree]);
  // The long-lived PWA already refreshes dayKey; seasonal content should move
  // with that same local-day boundary instead of requiring an app restart.
  const season = useMemo(
    () => getCurrentSeason(new Date(`${dayKey}T12:00:00`)),
    [dayKey],
  );
  const name = profile?.displayName?.trim();
  const time = timeOfDay();
  const t = useStrings();
  const hello = t.greeting[time];

  // Home projects only a compact snapshot from the canonical Quest board.
  const picks = useMemo(
    () => activeQuestAssignments(assignments, now),
    [assignments, now]
  );
  const activePicks = picks.filter((pick) => pick.status === "started");
  const readyPicks = picks.filter((pick) => pick.status === "assigned");
  const featuredPick = activePicks[0] ?? readyPicks[0];
  const featuredQuest = featuredPick
    ? questBySlug.get(featuredPick.questSlug)
    : undefined;
  const questSummary = [
    activePicks.length > 0 ? `${activePicks.length} active` : null,
    readyPicks.length > 0 ? `${readyPicks.length} ready` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
        <SeasonalAtmosphere density={7} />
      </div>

      <PageContainer className="relative pt-safe">
        {/* Personal welcome — one framed devotional surface with today's
            candle, echoing a bookplate rather than a dashboard header. */}
        <header
          data-paper-variant="paper"
          data-plus-nameplate={isPlus ? "active" : "free"}
          className={cn(
            "app-glass-surface sacred-frame relative mt-4 mb-4 overflow-hidden bg-paper/90 px-5 py-4 max-[380px]:px-4 max-[340px]:px-3 sm:mt-5 sm:px-6 sm:py-5",
            isPlus &&
              "border-[#b88528]/70 bg-[linear-gradient(135deg,rgba(255,248,218,0.94),rgba(246,225,159,0.9)_48%,rgba(255,249,224,0.94))] shadow-[0_12px_34px_rgba(126,85,24,0.2)] ring-1 ring-[#e2bd62]/65",
          )}
        >
          {/* Active Plus members receive a restrained gold bookplate flourish. */}
          {isPlus && (
            <>
              <span
                aria-hidden="true"
                className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#c99635]/80 to-transparent"
              />
              <span
                aria-hidden="true"
                className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-[#fff4bd]/60 blur-2xl"
              />
              <span
                aria-hidden="true"
                className="absolute right-3 bottom-2 font-display text-2xl text-[#a66f18]/20"
              >
                ✦
              </span>
            </>
          )}
          <div className="relative z-10 flex min-w-0 items-center gap-3 max-[380px]:gap-2 max-[340px]:gap-1.5">
            <Link
              href="/app/settings"
              aria-label={t.home.openSettings}
              className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Avatar
                name={profile?.displayName}
                marker={profileAvatarMarker(profile)}
                size="lg"
                className="ring-1 ring-paper/70 shadow-[0_8px_24px_rgb(18_33_27_/_0.14)] max-[380px]:h-[4.5rem] max-[380px]:w-[4.5rem] max-[340px]:h-16 max-[340px]:w-16"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-paper text-accent ring-1 ring-mist paper-shadow"
              >
                <IconSettings size={14} />
              </span>
            </Link>
            <div className="@container min-w-0 flex-1">
              {isPlus && (
                <p className="mb-1">
                  <span className="sr-only">BibleQuest Plus member</span>
                  <span
                    aria-hidden="true"
                    className="flex items-center gap-1.5 whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-[#8a5a12] @max-[8rem]:gap-1 @max-[8rem]:tracking-[0.1em]"
                  >
                    <span className="@max-[8rem]:hidden">✦</span>
                    <span>
                      BibleQuest{" "}
                      <strong className="font-black leading-none">+</strong>
                    </span>
                    <span className="@max-[8rem]:hidden">✦</span>
                  </span>
                </p>
              )}
              <p className="font-display text-[1rem] leading-tight text-accent max-[360px]:text-[0.875rem]">
                {name ? `${hello},` : season.label}
              </p>
              <h1
                className={cn(
                  "mt-1 truncate font-display text-[1.375rem] leading-tight text-graphite max-[360px]:text-[1.0625rem] min-[430px]:text-[1.5rem] sm:text-editorial",
                  isPlus &&
                    "bg-gradient-to-r from-[#7d5013] via-[#bb8124] to-[#7d5013] bg-clip-text text-transparent drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]",
                )}
              >
                {name || `${hello}.`}
              </h1>
              {name && (
                <p className="mt-1 text-[0.8125rem] uppercase tracking-[0.14em] text-ash max-[360px]:text-[0.6875rem] max-[360px]:tracking-[0.08em]">
                  {season.label}
                </p>
              )}
            </div>
            <StreakCard
              streak={streak}
              dayKey={dayKey}
              className="max-[340px]:w-12"
            />
          </div>
        </header>

        <div className="space-y-7 pb-7">
          {/* Scripture stays directly beneath the personal account surface,
              while the compact treatment leaves quests as Home's main work. */}
          <TodaysVerseLink />

          {/* For Today begins with the person's concrete quest, while all
              lifecycle management remains on the Quests screen. */}
          <section id="quests"
            aria-labelledby="for-today-home-title"
            className="scroll-mt-6"
          >
            <HomeSectionHeading
              id="for-today-home-title"
              title="For Today"
              subtitle="Your next step"
            />
            <Link href="/app/quests" className="block">
              <PaperCard
                interactive
                variant="paper"
                padding="md"
                className="flex min-h-24 items-center gap-4"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-linen ring-1 ring-mist">
                  <PixelIcon
                    name={
                      featuredQuest
                        ? CATEGORY_SPRITE[featuredQuest.category] ?? "scroll"
                        : "scroll"
                    }
                    size={5}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-pixel text-[1.75rem] uppercase leading-none tracking-[0.05em] text-accent min-[390px]:text-[2.125rem]">
                      {t.nav.quests}
                    </h2>
                    <p className="text-caption text-ash">
                      {questSummary || "Choose a quest"}
                    </p>
                  </div>
                  {featuredQuest && featuredPick ? (
                    <>
                      <p className="mt-2 line-clamp-2 font-display text-[1.125rem] leading-snug text-graphite">
                        {featuredQuest.title}
                      </p>
                      <p className="mt-1 text-caption text-ash">
                        {featuredPick.status === "assigned"
                          ? "Ready to begin"
                          : isQuestWindowOpen(featuredPick, now)
                            ? formatQuestWindowRemaining(
                                featuredPick.expiresAt,
                                now,
                              )
                            : "Window ended · Resume when ready"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-small text-ash">
                      Find a gentle next step for today.
                    </p>
                  )}
                  <span className="mt-2 inline-flex items-center gap-1 text-small font-medium text-accent">
                    View all quests <IconArrowRight size={14} />
                  </span>
                </div>
                <IconChevronRight className="shrink-0 text-fog" />
              </PaperCard>
            </Link>
          </section>

          {/* The optional weekly rhythm stays attached to the daily quest. */}
          <RhythmTodayCard dayKey={dayKey} now={now} />

          {/* Guided Scripture remains a distinct daily formation choice. */}
          <TodayFormation
            dayKey={dayKey}
            show="guide"
            afterGuide={
              <ShepherdCallout
                href={isPlus ? "/app/shepherd" : undefined}
                onClick={
                  isPlus
                    ? undefined
                    : () => setShepherdDialogOpen(true)
                }
              />
            }
          />

          {/* Growth uses the same left-aligned category rhythm as every Home section. */}
          <section aria-labelledby="growth-home-title">
            <HomeSectionHeading
              id="growth-home-title"
              title={t.home.yourGrowth}
              subtitle="Your journey"
            />
            <Link href="/app/journey" className="block">
              <PaperCard
                interactive
                variant="linen"
                padding="md"
                className="flex min-h-28 items-center gap-4"
              >
                <GrowthTree
                  state={tree}
                  size={96}
                  treeOnly
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-subheading text-graphite">
                    {tree.stageLabel}
                  </p>
                  {/* Gentle progression bar — the caption carries the meaning. */}
                  <div
                    aria-hidden="true"
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist/60"
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(progress?.fraction ?? 1) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-caption text-ash">
                    {tree.toNextStage != null
                      ? tree.toNextStage === 1
                        ? t.journey.toNextOne
                        : fmt(t.journey.toNext, { n: tree.toNextStage })
                      : t.journey.fullGrown}
                  </p>
                </div>
                <IconChevronRight className="shrink-0 text-fog max-[350px]:hidden" />
              </PaperCard>
            </Link>
          </section>

          {/* The arcade follows growth as the lighter play surface. */}
          <TodayFormation dayKey={dayKey} show="game" />

          {/* A gentle, once-per-context invitation to keep the journey
              safe across devices. Never a modal; easy to wave off. */}
          <AccountPrompt />

          {!isPlus && (
            <ExplorePlusLink
              className="mt-1"
              description="See every wallpaper and the complete Plus experience."
            />
          )}

          {/* One-time support remains separate from membership. */}
          <SupportLink />

          {/* These equal-width shortcuts form one calm, predictable action row. */}
          <div
            className="grid grid-cols-3 gap-2.5 sm:gap-4"
            aria-label="Prayer, Bible, and reflection shortcuts"
          >
            <QuickActionTile
              href="/app/prayer/new"
              sprite="candle"
              title="One minute of prayer"
            />
            <QuickActionTile
              href={
                readingPosition
                  ? `/app/bible/${readingPosition.bookSlug}/${readingPosition.chapter}`
                  : "/app/bible"
              }
              sprite="book"
              title="Open the Bible"
              ariaLabel={
                readingPosition
                  ? `Continue ${readingPosition.bookName} ${readingPosition.chapter}`
                  : "Open the Bible"
              }
            />
            <QuickActionTile
              href="/app/prayer/reflections"
              sprite="sun"
              title="Reflect on Today"
            />
          </div>

          {/* Newsletter updates remain available after voluntary support. */}
          <NewsletterLink />
          <PlusFeatureDialog
            open={shepherdDialogOpen}
            onClose={() => setShepherdDialogOpen(false)}
            title="Ask MyShepherd"
            description="MyShepherd’s bounded AI study companion is included with BibleQuest Plus."
          />
        </div>
      </PageContainer>
    </div>
  );
}

function TodaysVerseLink() {
  return (
    <motion.div variants={riseIn} initial="hidden" animate="visible">
      <Link
        href="/app/bible"
        className="group relative isolate flex min-h-20 items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border border-evergreen-600 bg-evergreen-700 px-4 py-4 text-[#fdfbf3] paper-shadow-lg transition-all duration-300 [transition-timing-function:var(--ease-gentle)] hover:-translate-y-0.5 hover:bg-evergreen-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
      >
        <span
          aria-hidden="true"
          className="ambient absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gold-300/15 blur-2xl [animation:var(--animate-twinkle)]"
        />
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#fdfbf3]/10 ring-1 ring-[#fdfbf3]/20">
          <PixelIcon name="open-book" size={4} animate />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block font-display text-[1.125rem] leading-tight">
            View Today&apos;s Verse
          </span>
          <span className="mt-1 block text-caption text-[#fdfbf3]/70">
            A quiet word is waiting in the Bible.
          </span>
        </span>
        <IconArrowRight className="relative shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
      </Link>
    </motion.div>
  );
}

function ShepherdCallout({
  href,
  onClick,
}: {
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <PaperCard
      interactive
      variant="outlined"
      padding="md"
      className="flex min-h-24 items-center gap-4"
      style={{ backgroundColor: "#3F7EA3", borderColor: "#3F7EA3" }}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-white/15 ring-1 ring-white/30">
        <PixelIcon name="star" size={5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-display text-[1.25rem] leading-tight text-white">
          Ask MyShepherd AI
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-caption font-medium text-white">
            Plus
          </span>
        </p>
        <p className="mt-1 text-caption leading-relaxed text-white/80">
          Explore Scripture and find your next place in BibleQuest.
        </p>
      </div>
      <IconChevronRight className="shrink-0 text-white/75" />
    </PaperCard>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-[var(--radius-card)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {content}
    </button>
  );
}

function QuickActionTile({
  href,
  sprite,
  title,
  ariaLabel,
}: {
  href: string;
  sprite: Parameters<typeof PixelIcon>[0]["name"];
  title: string;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="group block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <PaperCard
        interactive
        variant="paper"
        padding="sm"
        className="flex h-full min-h-[7.5rem] flex-col items-center justify-center gap-3 text-center sm:min-h-[8.25rem]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-linen ring-1 ring-mist transition-transform duration-300 group-hover:-translate-y-0.5">
          <PixelIcon name={sprite} size={4} />
        </span>
        <span className="text-[0.75rem] font-medium leading-snug text-graphite min-[390px]:text-[0.8125rem] sm:text-small">
          {title}
        </span>
      </PaperCard>
    </Link>
  );
}

export function HomeScreen() {
  return (
    <ClientOnly>
      <HomeInner />
    </ClientOnly>
  );
}
