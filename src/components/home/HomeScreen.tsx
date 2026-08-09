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
import { chapterHref } from "@/lib/bible/links";
import { timeOfDay, toDateKey } from "@/lib/utils/dates";
import { useStrings, fmt } from "@/lib/i18n";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { riseIn } from "@/lib/motion";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { AccountPrompt } from "@/components/account/AccountPrompt";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { CATEGORY_ART, ArtIcon } from "@/components/design-system/ArtIcon";
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
import { isNativeTarget } from "@/lib/platform/target";

function HomeInner() {
  const profile = useQuestOS((s) => s.profile);
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const readingPosition = useQuestOS((s) => s.readingPosition);
  const assignments = useQuestOS((s) => s.assignments);
  const { isPlus } = usePlus();
  const nativeTarget = isNativeTarget();
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

      <PageContainer className="relative pt-safe-gap-4">
        {/* Personal welcome — one framed devotional surface with today's
            candle, echoing a bookplate rather than a dashboard header. */}
        <header
          data-paper-variant="paper"
          data-plus-nameplate={isPlus ? "active" : "free"}
          className={cn(
            "app-glass-surface sacred-frame relative mb-4 overflow-hidden bg-paper/90 px-5 py-4 max-[380px]:px-4 max-[340px]:px-3 sm:px-6 sm:py-5",
            isPlus &&
              "plus-nameplate border-[#9f6a1f]/75 bg-[radial-gradient(circle_at_82%_18%,rgba(255,255,244,0.72),transparent_27%),linear-gradient(135deg,rgba(255,249,224,0.97),rgba(241,215,135,0.94)_49%,rgba(255,248,216,0.97))] shadow-[0_14px_38px_rgba(102,68,19,0.23)] ring-1 ring-[#e2bd62]/70",
          )}
        >
          {/* Active Plus members receive a luminous bookplate highlight while
              the corner-line ornament is drawn by `.plus-nameplate`. */}
          {isPlus && (
            <span
              aria-hidden="true"
              className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-[#fff6c7]/55 blur-2xl"
            />
          )}
          <div className="relative z-10 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 max-[430px]:gap-2 max-[340px]:gap-1.5 sm:gap-4">
            <Link
              href="/app/settings"
              aria-label={t.home.openSettings}
              className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Avatar
                name={profile?.displayName}
                marker={profileAvatarMarker(profile)}
                size="lg"
                className="ring-1 ring-paper/70 shadow-[0_8px_24px_rgb(18_33_27_/_0.14)] max-[430px]:h-[4.5rem] max-[430px]:w-[4.5rem] max-[340px]:h-16 max-[340px]:w-16"
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
                    className="flex items-center gap-1.5 whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-[#6f430c] @max-[8rem]:gap-1 @max-[8rem]:tracking-[0.1em]"
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
              <p
                className={cn(
                  "font-display text-[1rem] leading-tight max-[360px]:text-[0.875rem]",
                  isPlus ? "text-[#704713]" : "text-accent",
                )}
              >
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
                <p
                  className={cn(
                    "mt-1 text-[0.8125rem] uppercase tracking-[0.14em] max-[360px]:text-[0.6875rem] max-[360px]:tracking-[0.08em]",
                    isPlus ? "text-[#68512b]" : "text-ash",
                  )}
                >
                  {season.label}
                </p>
              )}
            </div>
            <StreakCard
              streak={streak}
              dayKey={dayKey}
              tone={isPlus ? "gold" : "default"}
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
            {/* The heading sits above the card, like every other section on
                this screen. It used to be duplicated *inside* the card — the
                same display h2 and the same caption, nested under "For Today" —
                so this one row carried two headings while Guided Scripture and
                the Arcade carried one. "For Today" said nothing the card did
                not; the count is what a reader actually wants from a label. */}
            <HomeSectionHeading
              id="for-today-home-title"
              title={t.nav.quests}
              subtitle={questSummary || "Choose a quest"}
            />
            <Link href="/app/quests" className="block">
              <PaperCard
                interactive
                variant="paper"
                padding="md"
                className="flex min-h-24 items-center gap-4"
              >
                <span className="flex shrink-0 items-center justify-center">
                  <ArtIcon
                    name={
                      featuredQuest
                        ? CATEGORY_ART[featuredQuest.category] ?? "scroll"
                        : "scroll"
                    }
                    size={80}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  {featuredQuest && featuredPick ? (
                    <>
                      <p className="line-clamp-2 font-display text-[1.125rem] leading-snug text-graphite">
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
                    <p className="text-small text-ash">
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
              isPlus ? (
                <ShepherdCallout href="/app/shepherd" />
              ) : nativeTarget ? undefined : (
                <ShepherdCallout
                  onClick={() => setShepherdDialogOpen(true)}
                />
              )
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
            role="group"
            className="grid grid-cols-3 gap-2.5 sm:gap-4"
            aria-label="Prayer, Bible, and reflection shortcuts"
          >
            <QuickActionTile
              href="/app/prayer/new"
              sprite="candle"
              title="One minute of prayer"
              animate
            />
            <QuickActionTile
              href={
                readingPosition
                  ? chapterHref(readingPosition.bookSlug, readingPosition.chapter)
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
        <span className="relative flex shrink-0 items-center justify-center">
          <ArtIcon name="open-book" size={68} />
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
      // Glass like the rest of the app, but the most opaque surface in it —
      // see `.app-glass-shepherd`. The flat inline fill it replaces sat outside
      // the material system entirely, which is why this card read as pasted on,
      // and an inline style would have out-ranked the class anyway.
      className="app-glass-shepherd flex min-h-24 items-center gap-4"
    >
      <span className="relative flex shrink-0 items-center justify-center">
        {/* Its own character, the same one the floating launcher uses. */}
        <ArtIcon
          name="myshepherd"
          size={68}
          className="[filter:drop-shadow(0_2px_4px_rgb(15_40_54/0.35))]"
        />
      </span>
      <div className="min-w-0 flex-1">
        {/* The badge leads rather than trailing the title. Sharing a wrapping
            line with it, "Plus" kept being pushed onto a line of its own,
            which read as a heading instead of a label. */}
        <span className="inline-flex rounded-full border border-white/25 bg-[#173c52]/55 px-2 py-0.5 text-caption font-medium text-white">
          Plus
        </span>
        <p className="mt-1 font-display text-[1.1875rem] leading-tight text-white">
          Ask MyShepherd AI
        </p>
        <p className="mt-1 text-caption leading-relaxed text-white">
          Explore Scripture and find your next place in BibleQuest.
        </p>
      </div>
      <IconChevronRight className="shrink-0 text-white" />
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
  animate = false,
}: {
  href: string;
  sprite: Parameters<typeof ArtIcon>[0]["name"];
  title: string;
  ariaLabel?: string;
  /** Play the sprite's hand-animated GIF, reduced-motion switch and all. */
  animate?: boolean;
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
        className="flex h-full min-h-[7rem] flex-col items-center justify-center gap-2.5 text-center sm:min-h-[7.75rem]"
      >
        {/* The chip has to be larger than the sprite it holds. At 44px around a
            44px icon the art was flush to all four edges and read as clipped. */}
        <span className="flex shrink-0 items-center justify-center transition-transform duration-300 group-hover:-translate-y-0.5">
          <ArtIcon name={sprite} size={68} animate={animate} />
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
