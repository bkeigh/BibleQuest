import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconCheck, IconSparkle } from "@/components/design-system/icons";

const FREE_INCLUDES = [
  "Daily verse, prayer, and quest",
  "The full Bible reader",
  "Private prayer journal",
  "Private reflection journal",
  "Your growth tree and journey",
  "Milestones and seasons",
];

const PLUS_FEATURES = [
  "A gentle AI study companion",
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
  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      {/* The free promise, stated plainly and first */}
      <PaperCard variant="paper" padding="lg">
        <p className="text-[0.75rem] uppercase tracking-[0.16em] text-olive-500">
          Free, always
        </p>
        <h3 className="mt-1.5 font-display text-[1.5rem] text-graphite">
          Everything that matters is free
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
          Your relationship with God is never paywalled. Scripture, prayer,
          reflection, quests, and your journey are free — and complete.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {FREE_INCLUDES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[0.9375rem] text-charcoal">
              <IconCheck size={17} className="text-olive-500" /> {f}
            </li>
          ))}
        </ul>
      </PaperCard>

      {/* Plus — candlelight, not gold-plated */}
      <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-4 -top-3 opacity-40">
          <PixelIcon name="lantern" size={9} animate />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-[0.75rem] text-gold-700">
          <IconSparkle size={14} /> BibleQuest Plus
        </span>
        <h3 className="mt-3 font-display text-[1.5rem] text-graphite">
          Go deeper, when you’re ready
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
          Plus adds guidance, personalization, and long-term insight. It deepens
          the experience — it never decides how close you are to God.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {PLUS_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[0.9375rem] text-charcoal">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /> {f}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[0.8125rem] text-ash">
          Plus is in preparation. It will arrive with honest, simple pricing —
          and the free experience will always stay whole.
        </p>
      </PaperCard>

      {/* Patron */}
      <PaperCard variant="paper" padding="lg">
        <p className="text-[0.75rem] uppercase tracking-[0.16em] text-olive-500">
          Patron
        </p>
        <h3 className="mt-1.5 font-display text-[1.375rem] text-graphite">
          Support the mission
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
          Some people simply want to help keep BibleQuest free and accessible.
          Patrons carry no spiritual advantage — only our gratitude. This too is
          coming soon.
        </p>
      </PaperCard>
    </div>
  );
}
