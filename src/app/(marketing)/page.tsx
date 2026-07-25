import type { Metadata } from "next";
import { EditorialSection, Eyebrow } from "@/components/design-system/EditorialSection";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { IconArrowRight } from "@/components/design-system/icons";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { Reveal } from "@/components/marketing/Reveal";
import { QuestDemo, PrayerDemo } from "@/components/marketing/Demos";
import { MarketingGrowthLoop } from "@/components/marketing/MarketingGrowthLoop";
import { VerseDemo } from "@/components/marketing/VerseDemo";
import { NewsletterSignup } from "@/components/newsletter/NewsletterSignup";
import { PlusInvitationLink } from "@/components/plus/PlusInvitationLink";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { questBySlug, seedQuests } from "@/data/seed/quests";

/* "Today's Verse" is date-derived — re-render hourly so it doesn't freeze at deploy. */
export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const RHYTHM = [
  { sprite: "book", title: "Read", body: "One verse, chosen for today. Slow enough to actually land." },
  { sprite: "candle", title: "Pray", body: "A private-by-default place to speak honestly and remember." },
  { sprite: "sun", title: "Reflect", body: "One short question that helps the day land." },
  { sprite: "heart", title: "Act", body: "Pick up to three small quests that take faith into your actual day." },
] as const;

const FAQ = [
  {
    q: "Is BibleQuest free?",
    a: "Yes. Bible reading, quests, prayer, reflection, and your whole journey are free — and complete. Plus adds depth later; it never gates your relationship with God.",
  },
  {
    q: "Is this a streak app?",
    a: "There's a candle that stays lit as you show up each day — but it never guilts you. Miss a day, a week, a season, and nothing is lost: your tree, prayers, and journey stay exactly as you left them. One small step relights the candle.",
  },
  {
    q: "Is this replacing church?",
    a: "No. BibleQuest supports your walk with God through the week. It is not a replacement for church, clergy, community, or pastoral care.",
  },
  {
    q: "Will my prayers be private?",
    a: "Yes—private by default. Signed-out entries stay in your browser; signed-in entries sync to your protected BibleQuest account. We never sell personal data, and analytics never include prayer or journal text.",
  },
];

export default function LandingPage() {
  const verse = getDailyVerse();
  const quest =
    questBySlug.get("send-a-kind-word") ??
    seedQuests.find((q) => q.category === "kindness") ??
    seedQuests[0];

  return (
    <>
      {/* Hero */}
      <section className="relative isolate min-h-[100svh] overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_55%_at_84%_36%,var(--color-gold-50),transparent_72%),radial-gradient(45%_55%_at_0%_75%,var(--color-evergreen-50),transparent_75%)]"
        />
        <div className="relative mx-auto grid min-h-[100svh] w-full max-w-6xl items-center gap-10 px-5 pb-20 pt-28 sm:px-8 sm:pb-24 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:pb-20 lg:pt-24">
          <div className="text-left">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-mist bg-paper/70 px-3.5 py-1.5 text-[0.8125rem] text-accent backdrop-blur">
                <PixelIcon name="candle" size={3} animate /> A daily guide for living your faith
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h1
                id="homepage-heading"
                tabIndex={-1}
                className="mt-6 max-w-3xl font-display text-[clamp(3rem,6vw,5rem)] leading-[0.98] tracking-[-0.035em] text-graphite outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                Bring faith into the life you already live.
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-6 max-w-xl text-[1.125rem] leading-relaxed text-charcoal sm:text-[1.25rem]">
                Read Scripture, make space to pray, and take one meaningful
                step. BibleQuest helps faith become part of your everyday life.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <GentleLink variant="primary" size="lg" href="/onboarding">
                  Get BibleQuest <IconArrowRight />
                </GentleLink>
                <GentleLink variant="outline" size="lg" href="/#how">
                  See how it works
                </GentleLink>
              </div>
            </Reveal>
            <Reveal delay={0.3}>
              <p className="mt-4 text-[0.875rem] text-ash">
                Free to begin. Made for Christians from every tradition.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.28} className="w-full lg:justify-self-end">
            <div className="mx-auto w-full max-w-lg lg:mx-0">
              <VerseDemo verse={verse} />
            </div>
          </Reveal>

          <Reveal
            delay={0.4}
            className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 sm:block"
          >
            <a
              href="#why"
              aria-label="Continue to learn more about BibleQuest"
              className="group flex h-11 w-11 items-center justify-center rounded-full border border-mist/80 bg-paper/55 text-fog backdrop-blur-sm transition-colors hover:border-olive-300 hover:text-accent"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="transition-transform group-hover:translate-y-0.5"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </a>
          </Reveal>
        </div>
      </section>

      {/* Problem */}
      <EditorialSection id="why" className="scroll-mt-20" spacing="compact">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>The real problem</Eyebrow>
            <h2 className="font-display text-editorial text-graphite sm:text-heading">
              Most people don’t lack access to Scripture. They lack a way to
              live it.
            </h2>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-ash">
              You already know faith matters. The hard part is the next step —
              something clear and small you can actually do in the middle of an
              ordinary day. That’s what BibleQuest is for.
            </p>
          </div>
        </Reveal>
      </EditorialSection>

      {/* The daily rhythm */}
      <EditorialSection id="how" className="scroll-mt-20 bg-linen" spacing="compact">
        <Reveal>
          <div className="text-center">
            <PixelMascot name="map" size={8} className="mb-6" />
            <Eyebrow>A daily rhythm</Eyebrow>
            <h2 className="font-display text-editorial text-graphite sm:text-heading">
              Read. Pray. Reflect. Act.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] text-ash">
              Four small movements. Two minutes or twenty. Both feel complete.
            </p>
          </div>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4">
          {RHYTHM.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.06}>
              <PaperCard variant="paper" padding="lg" className="h-full text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-linen ring-1 ring-mist">
                  <PixelIcon name={r.sprite} size={5} />
                </div>
                <h3 className="font-display text-[1.25rem] text-graphite">{r.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ash">{r.body}</p>
              </PaperCard>
            </Reveal>
          ))}
        </div>
      </EditorialSection>

      {/* Product demonstration */}
      <EditorialSection spacing="compact">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
          <Reveal>
            <div>
              <Eyebrow>Quests</Eyebrow>
              <h2 className="font-display text-editorial text-graphite sm:text-heading">
                Turn Scripture into something you do
              </h2>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-ash">
                Each day you pick up to three quests — encourage someone, sit
                in silence for five minutes, give thanks out loud. Every quest
                is rooted in Scripture and doable before dinner. Never a chore.
                Never a guilt trip.
              </p>
              <GentleLink variant="text" href="/onboarding" className="mt-4">
                Browse the quests <IconArrowRight />
              </GentleLink>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <QuestDemo quest={quest} />
          </Reveal>
        </div>
      </EditorialSection>

      {/* Ethos — the deep-green band */}
      <section className="relative overflow-hidden bg-dusk">
        <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
            <Reveal className="order-2 lg:order-1">
              <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden text-center">
                <MarketingGrowthLoop />
              </PaperCard>
            </Reveal>
            <Reveal delay={0.1} className="order-1 lg:order-2">
              <div>
                <p className="mb-4 text-[0.8125rem] font-medium uppercase tracking-[0.18em] text-gold-300">
                  Growth you can feel
                </p>
                <h2 className="font-display text-editorial text-moon-paper sm:text-heading">
                  Your journey grows with you
                </h2>
                <div className="mt-5 h-0.5 w-12 bg-gold-500" aria-hidden />
                <p className="mt-5 text-[1.0625rem] leading-relaxed text-moon-paper/75">
                  Prayer, Scripture, reflection, and kindness help your tree
                  take shape. There are no leaderboards and nothing withers
                  while you are away. Come back when you are ready. Your
                  journey will be waiting.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Living journal */}
      <EditorialSection spacing="compact">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
          <Reveal>
            <div>
              <Eyebrow>A living journal</Eyebrow>
              <h2 className="font-display text-editorial text-graphite sm:text-heading">
                Prayers and reflections, private by default
              </h2>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-ash">
                Write honestly. Mark prayers answered when they are. Over the
                years, this journal becomes one of the most meaningful things
                you own. Journal text stays out of analytics and is never sent
                to AI.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <PrayerDemo />
          </Reveal>
        </div>
      </EditorialSection>

      {/* Free promise */}
      <EditorialSection className="bg-linen" spacing="compact">
        <Reveal>
          <PaperCard variant="paper" padding="lg" className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface">
              <PixelIcon name="chapel" size={5} />
            </div>
            <h2 className="font-display text-editorial text-graphite">
              Your relationship with God is not paywalled
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[1.0625rem] leading-relaxed text-ash">
              Scripture, prayer, reflection, quests, and your whole journey are
              free — and always will be. Plus adds depth for those who want it
              and helps keep BibleQuest alive.
            </p>
            {/* Match the in-app Explore Plus card while keeping the pricing route. */}
            <PlusInvitationLink
              href="/pricing"
              title="See what’s free and what’s Plus"
              description="Compare the complete free experience with everything included in Plus."
              className="mt-6"
            />
          </PaperCard>
        </Reveal>
      </EditorialSection>

      {/* FAQ */}
      <EditorialSection spacing="compact">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="text-center font-display text-editorial text-graphite">
              Common questions
            </h2>
          </Reveal>
          <DisclosureGroup className="mt-6 sm:mt-8">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.05}>
                <Disclosure
                  variant="card"
                  label={<span className="font-display text-[1.125rem]">{f.q}</span>}
                  defaultOpen={i === 0}
                >
                  <p className="text-[0.9375rem] leading-relaxed text-ash">
                    {f.a}
                  </p>
                </Disclosure>
              </Reveal>
            ))}
          </DisclosureGroup>
        </div>
      </EditorialSection>

      {/* Newsletter */}
      <EditorialSection
        id="newsletter"
        className="scroll-mt-20 bg-linen"
        spacing="compact"
      >
        <NewsletterSignup />
      </EditorialSection>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-mist bg-linen">
        <div className="pointer-events-none absolute inset-0">
          <SeasonalAtmosphere density={10} />
        </div>
        <div className="relative mx-auto max-w-2xl px-5 py-16 text-center sm:px-8 sm:py-20">
          <Reveal>
            <PixelIcon name="lantern" size={8} animate className="mx-auto" />
            <h2 className="mt-6 font-display text-editorial text-graphite sm:text-heading">
              Everyone’s walk with God is different.
              <br />
              Everyone can take a step today.
            </h2>
            <GentleLink variant="primary" size="lg" href="/onboarding" className="mt-8">
              Start free <IconArrowRight />
            </GentleLink>
            <p className="mt-4 text-[0.875rem] text-ash">
              No account to start. Installs like an app, works offline.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
