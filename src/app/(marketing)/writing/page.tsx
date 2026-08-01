import { MarketingPage, Prose } from "@/components/marketing/MarketingPage";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { marketingMetadata } from "@/lib/metadata";

export const metadata = marketingMetadata({
  title: "Writing",
  description:
    "Essays on faith, rhythm, and building a spiritual app that refuses shame. Coming soon.",
  path: "/writing",
});

const PLANNED = [
  "Why faith should not feel like homework",
  "Why BibleQuest does not use shame streaks",
  "One meaningful step is enough for today",
  "How to start praying again without feeling fake",
  "How to start reading the Bible when you feel overwhelmed",
  "Pilgrimage, not productivity",
];

export default function WritingPage() {
  return (
    <MarketingPage
      eyebrow="Writing"
      title="Ideas before features."
      intro="BibleQuest starts from a way of thinking about faith and technology. Essays are coming. These are first:"
    >
      <div className="not-prose space-y-3">
        {PLANNED.map((title) => (
          <PaperCard key={title} variant="quiet" padding="md" className="flex items-center gap-3">
            <PixelIcon name="book" size={68} />
            <span className="text-[1rem] text-charcoal">{title}</span>
          </PaperCard>
        ))}
      </div>
      <Prose>
        Nothing is published yet — when the first essay is ready, it will live
        here.
      </Prose>
    </MarketingPage>
  );
}
