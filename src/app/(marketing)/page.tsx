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
import { VerseDemo } from "@/components/marketing/VerseDemo";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { calculateTreeState } from "@/lib/questos/growth-engine";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { questBySlug, seedQuests } from "@/data/seed/quests";

/* "Today's Verse" is date-derived — re-render hourly so it doesn't freeze at deploy. */
export const revalidate = 3600;

const RHYTHM = [
  { sprite: "book", title: "Read", body: "One verse, chosen for today. Slow enough to actually land." },
  { sprite: "candle", title: "Pray", body: "A private place to speak honestly. No one else sees it." },
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
    a: "Prayer and reflection are private by default. We never sell your data, and analytics never include your prayer or journal text.",
  },
];

export default function LandingPage() {
  const verse = getDailyVerse();
  const quest =
    questBySlug.get("send-a-kind-word") ??
    seedQuests.find((q) => q.category === "kindness") ??
    seedQuests[0];

  // A demo tree partway along its pilgrimage.
  const demoTree = calculateTreeState(
    Array.from({ length: 22 }, (_, i) => ({
      id: String(i),
      growthType: (["roots", "branches", "leaves", "fruit", "sunlight", "flowers"] as const)[i % 6],
      amount: 1,
      sourceType: "quest_completed" as const,
      occurredAt: new Date(0).toISOString(),
    }))
  );

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <SeasonalAtmosphere density={14} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-gold-50),transparent)]" />
        <div className="relative mx-auto flex min-h-[88vh] max-w-3xl flex-col items-center justify-center px-5 pb-20 pt-32 text-center sm:px-8">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-mist bg-paper/70 px-3.5 py-1.5 text-[0.8125rem] text-accent backdrop-blur">
              <PixelIcon name="candle" size={3} animate /> Your candle is waiting.
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 font-display text-heading text-graphite sm:text-display">
              Faith, one small step at a time.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-5 max-w-xl text-[1.125rem] leading-relaxed text-charcoal">
              One verse, one prayer, and a small step you can live out today.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <GentleLink variant="primary" size="lg" href="/onboarding">
                Start today — it’s free <IconArrowRight />
              </GentleLink>
              <GentleLink variant="outline" size="lg" href="/#how">
                See how it works
              </GentleLink>
            </div>
          </Reveal>
          <Reveal delay={0.34} className="mt-14 w-full max-w-md">
            <VerseDemo verse={verse} />
          </Reveal>
        </div>
      </section>

      {/* Problem */}
      <EditorialSection spacing="loose">
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
      <EditorialSection id="how" className="bg-linen" spacing="loose">
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
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <EditorialSection spacing="loose">
        <div className="grid items-center gap-10 lg:grid-cols-2">
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
        <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal className="order-2 lg:order-1">
              <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden text-center">
                <div className="pointer-events-none absolute inset-0">
                  <SeasonalAtmosphere density={6} />
                </div>
                <div className="relative flex justify-center">
                  <GrowthTree state={demoTree} size={240} />
                </div>
                <p className="relative mt-2 font-display text-[1.25rem] text-graphite">
                  {demoTree.stageLabel}
                </p>
              </PaperCard>
            </Reveal>
            <Reveal delay={0.1} className="order-1 lg:order-2">
              <div>
                <p className="mb-4 text-[0.8125rem] font-medium uppercase tracking-[0.18em] text-gold-300">
                  Pilgrimage, not points
                </p>
                <h2 className="font-display text-editorial text-moon-paper sm:text-heading">
                  A living tree, not a score
                </h2>
                <div className="mt-5 h-0.5 w-12 bg-gold-500" aria-hidden />
                <p className="mt-5 text-[1.0625rem] leading-relaxed text-moon-paper/75">
                  Prayer feeds the roots. Scripture grows the branches. Kindness
                  grows the leaves. No XP, no leaderboard, no decay. Miss a week
                  and nothing is lost — the tree waits, and grows again when you
                  come back.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Living journal */}
      <EditorialSection spacing="loose">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <div>
              <Eyebrow>A living journal</Eyebrow>
              <h2 className="font-display text-editorial text-graphite sm:text-heading">
                Prayers and reflections, private by default
              </h2>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-ash">
                Write honestly. Mark prayers answered when they are. Over the
                years, this journal becomes one of the most meaningful things
                you own — and it stays private by default, always.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <PrayerDemo />
          </Reveal>
        </div>
      </EditorialSection>

      {/* Free promise */}
      <EditorialSection className="bg-linen" spacing="loose">
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
            <GentleLink variant="outline" href="/pricing" className="mt-6">
              See what’s free and what’s Plus
            </GentleLink>
          </PaperCard>
        </Reveal>
      </EditorialSection>

      {/* FAQ */}
      <EditorialSection spacing="loose">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="text-center font-display text-editorial text-graphite">
              Common questions
            </h2>
          </Reveal>
          <DisclosureGroup className="mt-8">
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

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-mist bg-linen">
        <div className="pointer-events-none absolute inset-0">
          <SeasonalAtmosphere density={10} />
        </div>
        <div className="relative mx-auto max-w-2xl px-5 py-24 text-center sm:px-8 sm:py-32">
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
