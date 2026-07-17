import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconCheck, IconSparkle } from "@/components/design-system/icons";
import { PlusCta } from "@/components/plus/PlusCta";
import { getRevenueCatAvailability } from "@/lib/revenuecat/client";

const FREE_INCLUDES = [
  "Daily verse, prayer, and quests",
  "The full Bible reader",
  "Private prayer journal",
  "Private reflection journal",
  "Your growth tree and journey",
  "Milestones and seasons",
];

const PLUS_FEATURES = [
  "An AI study companion",
  "Personalized quests for your life",
  "Guided reading plans",
  "Reflection insights over time",
  "Premium seasonal themes",
  "Voice journaling",
  "Your Year in Review",
  "Family prayer circles",
];

/**
 * Plus content — shared between the marketing pricing page and the in-app
 * Plus page. Free is presented first and fully; Plus is depth, not a wall.
 */
export function PlusContent({ compact = false }: { compact?: boolean }) {
  const revenueCat = getRevenueCatAvailability();

  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      {/* The free promise, stated plainly and first */}
      <PaperCard variant="paper" padding="lg">
        <p className="text-[0.75rem] uppercase tracking-[0.16em] text-accent">
          Free, always
        </p>
        <h3 className="mt-1.5 font-display text-[1.5rem] text-graphite">
          Everything that matters is free
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
          Your relationship with God is never paywalled. Scripture, prayer,
          reflection, quests, and your journey are free — and complete. This is
          the whole app, and it’s what you get today.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {FREE_INCLUDES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[0.9375rem] text-charcoal">
              <IconCheck size={17} className="text-accent" /> {f}
            </li>
          ))}
        </ul>
      </PaperCard>

      {/* Plus — candlelight, not gold-plated */}
      <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-4 -top-3 opacity-40">
          <PixelIcon name="lantern" size={9} animate />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/45 bg-gold-500/15 px-3 py-1 text-[0.75rem] text-gilt">
          <IconSparkle size={14} /> BibleQuest Plus
          {revenueCat.configured ? "" : " — coming soon"}
        </span>
        <h3 className="mt-3 font-display text-[1.5rem] text-graphite">
          Go deeper, when you’re ready
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
          Plus adds guidance, personalization, and long-term insight. It
          deepens the experience — it never decides how close you are to God.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {PLUS_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[0.9375rem] text-charcoal">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" /> {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.8125rem] leading-relaxed text-charcoal">
          <span className="text-gilt">Our pledge:</span> 5% of BibleQuest’s
          proceeds goes to churches and nonprofits.
        </p>
        <PlusCta />
      </PaperCard>

      {/* Patron */}
      <PaperCard variant="paper" padding="lg">
        <p className="text-[0.75rem] uppercase tracking-[0.16em] text-accent">
          Patron
        </p>
        <h3 className="mt-1.5 font-display text-[1.375rem] text-graphite">
          Support the mission
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
          Some people just want to help keep BibleQuest free for everyone.
          Patrons get our gratitude — no spiritual perks, ever. Coming after
          Plus.
        </p>
      </PaperCard>
    </div>
  );
}
