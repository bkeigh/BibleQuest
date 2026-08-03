import type { Metadata } from "next";
import Link from "next/link";
import { EditorialSection, Eyebrow } from "@/components/design-system/EditorialSection";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { ArtMascot } from "@/components/design-system/ArtMascot";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { IconArrowRight } from "@/components/design-system/icons";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { Reveal } from "@/components/marketing/Reveal";
import { QuestDemo, PrayerDemo } from "@/components/marketing/Demos";
import { MarketingGrowthLoop } from "@/components/marketing/MarketingGrowthLoop";
import { HeroBackdrop } from "@/components/marketing/HeroBackdrop";
import { VerseDemo } from "@/components/marketing/VerseDemo";
import { NewsletterSignup } from "@/components/newsletter/NewsletterSignup";
import { PlusInvitationLink } from "@/components/plus/PlusInvitationLink";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { questBySlug, seedQuests } from "@/data/seed/quests";
import { ACCOUNT_SYNC_CONTAINED } from "@/lib/sync/containment";
import { SUPPORT_EMAIL } from "@/lib/brand";

/* "Today's Verse" is date-derived — re-render hourly so it doesn't freeze at deploy. */
export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Describes the product and its publisher without adding invented ratings or claims.
const MARKETING_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.biblequest.co/#organization",
      name: "Winterhill Studio",
      url: "https://winterhill.studio",
      email: SUPPORT_EMAIL,
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.biblequest.co/#application",
      name: "BibleQuest",
      url: "https://www.biblequest.co",
      description:
        "A daily Christian companion for Scripture, prayer, reflection, and practical acts of faith.",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      publisher: {
        "@id": "https://www.biblequest.co/#organization",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Daily Bible verses",
        "Bible reading and bookmarks",
        "Private prayer and reflection journal",
        "Practical faith quests",
        "Personal faith journey",
      ],
    },
  ],
} as const;

const RHYTHM = [
  { sprite: "book", title: "Read", body: "One verse, chosen for today. Slow enough to actually land." },
  { sprite: "candle", title: "Pray", body: "A private-by-default place to speak honestly and remember." },
  { sprite: "sun", title: "Reflect", body: "One short question that helps the day land." },
  { sprite: "service-basket", title: "Act", body: "Pick up to three small quests that take faith into your actual day." },
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
    a: ACCOUNT_SYNC_CONTAINED
      ? "Yes—private by default. Entries stay in your browser on this device while account sync is temporarily unavailable. We never sell personal data, and analytics never include prayer or journal text."
      : "Yes—private by default. Signed-out entries stay in your browser; signed-in entries sync to your protected BibleQuest account. We never sell personal data, and analytics never include prayer or journal text.",
  },
];

/** Keeps the hero's invitation visible and unmistakable without arcade styling. */
function HeroAction({
  href,
  icon,
  title,
  detail,
  primary = false,
}: {
  href: string;
  icon: "open-book" | "compass";
  title: string;
  detail: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative isolate flex min-h-[4.75rem] w-full items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border px-4 py-3 text-left paper-shadow-lg transition-all duration-300 [transition-timing-function:var(--ease-gentle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0 sm:w-auto sm:min-w-[15rem] lg:min-h-[5.25rem] lg:min-w-[17rem] lg:px-5 ${
        primary
          ? "border-evergreen-600 bg-evergreen-700 text-[#fdfbf3] hover:-translate-y-0.5 hover:bg-evergreen-600"
          : "border-accent/45 bg-paper/75 text-accent backdrop-blur-sm hover:-translate-y-0.5 hover:border-accent/70 hover:bg-paper"
      }`}
    >
      {primary && (
        <span
          aria-hidden="true"
          className="ambient absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gold-300/15 blur-2xl [animation:var(--animate-twinkle)]"
        />
      )}
      {/* The plate is gone, so the light/dark variants it carried go with it —
          the sprite is drawn transparent and reads on either background. */}
      <span className="relative flex shrink-0 items-center justify-center">
        <ArtIcon name={icon} size={68} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-[1.125rem] leading-tight lg:text-[1.25rem]">
          {title}
        </span>
        <span
          className={`mt-1 block text-[0.8125rem] leading-snug ${
            primary ? "text-[#fdfbf3]/70" : "text-ash"
          }`}
        >
          {detail}
        </span>
      </span>
      <IconArrowRight className="relative shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

/** Gives visitors an obvious, quiet path into the rest of the landing story. */
function ScrollCue({ mobile = false }: { mobile?: boolean }) {
  return (
    <a
      href="#why"
      aria-label="Scroll to learn more about BibleQuest"
      className={`group flex flex-col items-center gap-1 text-ash transition-colors hover:text-accent ${
        mobile ? "mt-7 lg:hidden" : ""
      }`}
    >
      <span className="font-art-label text-[0.75rem] uppercase tracking-[0.14em]">
        Scroll
      </span>
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-mist/80 bg-paper/65 backdrop-blur-sm transition-colors group-hover:border-olive-300">
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
      </span>
    </a>
  );
}

export default function LandingPage() {
  const verse = getDailyVerse();
  const quest =
    questBySlug.get("send-a-kind-word") ??
    seedQuests.find((q) => q.category === "kindness") ??
    seedQuests[0];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(MARKETING_STRUCTURED_DATA).replaceAll(
            "<",
            "\\u003c",
          ),
        }}
      />
      {/* Hero */}
      <section className="relative isolate min-h-[100svh] overflow-hidden">
        <HeroBackdrop />
        <div className="relative mx-auto grid min-h-[100svh] w-full max-w-[90rem] content-start items-start gap-10 px-5 pb-14 pt-24 sm:px-8 sm:pb-20 sm:pt-28 lg:content-center lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-16 lg:px-12 lg:pb-20 lg:pt-28 xl:gap-20 xl:px-16">
          <div className="text-center lg:text-left">
            <Reveal immediate>
              <span className="mx-auto inline-flex items-center justify-center gap-2 rounded-full border border-mist bg-paper/70 px-4 py-2 text-[0.875rem] text-accent backdrop-blur lg:mx-0 lg:text-[0.9375rem]">
                <ArtIcon name="candle" size={56} animate /> A daily guide for living your faith
              </span>
            </Reveal>
            <Reveal immediate>
              <h1
                id="homepage-heading"
                tabIndex={-1}
                className="mx-auto mt-6 max-w-3xl font-display text-[clamp(3rem,13vw,4.75rem)] leading-[0.98] tracking-[-0.035em] text-graphite outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent lg:mx-0 lg:max-w-[44rem] lg:text-[clamp(4.5rem,5.25vw,5.5rem)]"
              >
                <strong className="font-semibold">Bring faith</strong> into{" "}
                <span className="underline decoration-gold-500/65 decoration-[0.08em] underline-offset-[0.12em]">
                  the life you live.
                </span>
              </h1>
            </Reveal>
            <Reveal immediate>
              <p className="mx-auto mt-7 max-w-xl text-[1.125rem] leading-relaxed text-charcoal sm:text-[1.25rem] lg:mx-0 lg:max-w-2xl lg:text-[1.375rem]">
                Read Scripture, make space to pray, and take one meaningful
                step. BibleQuest helps faith become part of your everyday life.
              </p>
            </Reveal>
            <Reveal immediate>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <HeroAction
                  primary
                  href="/onboarding"
                  icon="open-book"
                  title="Get BibleQuest"
                  detail="Begin your daily rhythm"
                />
                <HeroAction
                  href="/#how"
                  icon="compass"
                  title="See how it works"
                  detail="Walk through the app"
                />
              </div>
            </Reveal>
            <Reveal immediate>
              <p className="mx-auto mt-5 w-fit rounded-full border border-paper/80 bg-paper/80 px-4 py-2 text-[0.875rem] font-medium text-charcoal shadow-sm backdrop-blur-sm lg:mx-0 lg:text-[0.9375rem]">
                Free to begin. Made for Christians from every tradition.
              </p>
            </Reveal>
            <ScrollCue mobile />
          </div>

          <Reveal immediate className="w-full lg:justify-self-end">
            <div className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-[37rem]">
              <VerseDemo verse={verse} />
            </div>
          </Reveal>

          <Reveal
            immediate
            className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 lg:block xl:bottom-10"
          >
            <ScrollCue />
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
            <ArtMascot name="map" size={192} className="mb-6" />
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
                <div className="mx-auto mb-4 flex items-center justify-center">
                  <ArtIcon name={r.sprite} size={80} />
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
            <div className="mx-auto mb-4 flex items-center justify-center">
              <ArtIcon name="chapel" size={80} />
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

      {/* Keeps newsletter signup available without blocking app access. */}
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
            <ArtIcon name="lantern" size={120} className="mx-auto" />
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
