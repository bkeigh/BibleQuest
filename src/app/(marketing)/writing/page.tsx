import { MarketingPage, Prose } from "@/components/marketing/MarketingPage";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";

export const metadata = {
  title: "Writing",
  description:
    "Essays on faith, rhythm, and building a spiritual app that refuses shame. Coming soon.",
};

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
      intro="BibleQuest leads with a way of thinking about faith and technology. Essays are on the way — warm, honest, and unhurried."
    >
      <Prose>Here’s what we’re working on first:</Prose>
      <div className="not-prose space-y-3">
        {PLANNED.map((title) => (
          <PaperCard key={title} variant="quiet" padding="md" className="flex items-center gap-3">
            <PixelIcon name="book" size={4} />
            <span className="text-[1rem] text-charcoal">{title}</span>
            <span className="ml-auto text-[0.75rem] text-fog">Soon</span>
          </PaperCard>
        ))}
      </div>
    </MarketingPage>
  );
}
