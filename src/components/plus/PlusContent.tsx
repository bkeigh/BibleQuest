import { PaperCard } from "@/components/design-system/PaperCard";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { IconCheck, IconSparkle } from "@/components/design-system/icons";
import { PlusCta } from "@/components/plus/PlusCta";
import { GentleLink } from "@/components/design-system/GentleButton";
import { Disclosure } from "@/components/design-system/Disclosure";
import { webCommerceAvailable } from "@/lib/platform/purchases";

// Free includes every core formation loop; Plus adds breadth and flexibility.
const FREE_INCLUDES = [
  "150 reviewed quests across 14 categories",
  "Three rolling 24-hour quest slots",
  "The full Bible reader",
  "A complete guided Scripture practice each day",
  "The Learning to Remain guided pilgrimage",
  "One rotating Scripture game each day",
  "One gentle weekly rhythm",
  "Private prayer journal",
  "Private reflection journal",
  "Your growth tree and journey",
  "38 milestones and seasons",
];

// Paid benefits avoid spiritual status, pressure, or claims of greater faith.
const PLUS_FEATURES = [
  "Unlimited active quest windows",
  "Unlimited daily verse refreshes",
  "Additional reviewed guided pilgrimages",
  "The Scripture game archive and visual themes",
  "Up to three rhythms with a busy-day fallback",
  "Every still and live wallpaper",
  "Find a reviewed quest by focus, category, and time",
  "Private matching uses structured choices — never journals or personal writing",
  "Support continued access for the whole community",
];

/**
 * Plus content — shared between the marketing pricing page and the in-app
 * Plus page. The free promise stays close without pushing Plus below the fold.
 */
export function PlusContent({ compact = false }: { compact?: boolean }) {
  const showWebCommerce = webCommerceAvailable();

  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      {/* Keep the full free promise available without hiding the Plus offer. */}
      <Disclosure
        variant="card"
        label={
          <span className="text-[0.8125rem] uppercase tracking-[0.14em] text-accent">
            Always included
          </span>
        }
      >
        <p className="text-[0.9375rem] leading-relaxed text-charcoal">
          Your relationship with God is never paywalled. Scripture, prayer,
          reflection, quests, and your journey remain available and complete.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {FREE_INCLUDES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[0.9375rem] text-charcoal">
              <IconCheck size={17} className="text-accent" /> {f}
            </li>
          ))}
        </ul>
      </Disclosure>

      {/* Plus — crown in the content flow so it never crowds a corner. */}
      <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden">
        <div className="flex items-center gap-3">
          <span className="flex shrink-0 items-center justify-center">
            <ArtIcon name="crown" size={52} />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/45 bg-gold-500/15 px-3 py-1 text-[0.75rem] text-gilt">
            <IconSparkle size={14} /> BibleQuest Plus
          </span>
        </div>
        <h3 className="mt-3 font-display text-[1.5rem] text-graphite">
          Go deeper, when you’re ready
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
          Plus adds more room for quests and rhythms, more guided pilgrimage
          paths, the Scripture game archive, and every wallpaper.
          It deepens the experience — it never decides how close you are to
          God.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {PLUS_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[0.9375rem] text-charcoal">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" /> {f}
            </li>
          ))}
        </ul>
        <PlusCta />
      </PaperCard>

      {/* App Store builds hide every external Stripe entry point. */}
      {showWebCommerce && (
        <PaperCard variant="paper" padding="lg">
          <p className="text-[0.75rem] uppercase tracking-[0.16em] text-accent">
            One-time support
          </p>
          <h3 className="mt-1.5 font-display text-[1.375rem] text-graphite">
            Support the mission
          </h3>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
            Some people just want to help keep BibleQuest growing for everyone.
            One-time supporters get our gratitude — no spiritual perks, ever.
          </p>
          <GentleLink
            variant="gold"
            size="sm"
            href="/support"
            className="mt-4 min-h-11"
          >
            Support BibleQuest
          </GentleLink>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-ash">
            One-time support is separate from Plus and is not tax-deductible.
            Stripe Checkout appears only when separately approved and enabled.
          </p>
        </PaperCard>
      )}
    </div>
  );
}
