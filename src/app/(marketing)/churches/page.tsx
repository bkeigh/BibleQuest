import {
  MarketingPage,
  Prose,
  ProseHeading,
} from "@/components/marketing/MarketingPage";
import { GentleLink } from "@/components/design-system/GentleButton";

export const metadata = {
  title: "For Churches",
  description:
    "BibleQuest helps faith become a daily rhythm through the week. Church and small-group tools are on the way.",
};

export default function ChurchesPage() {
  return (
    <MarketingPage
      eyebrow="For churches & groups"
      title="Faith that continues through the week."
      intro="Many communities want members to practice faith between Sundays — not just attend on them. BibleQuest is built to help, gently."
    >
      <Prose>
        Today, BibleQuest is a personal daily companion: one verse, one prayer,
        one reflection, and one small quest. It is not a replacement for church,
        Bible study, pastoral care, or discipleship — it’s a quiet way to carry
        faith into ordinary days.
      </Prose>

      <ProseHeading>What’s coming for communities</ProseHeading>
      <Prose>
        We’re designing shared reading plans, group quests, prayer circles with
        real privacy controls, and small-group reflections. What we will never
        build: holiness leaderboards, public shame for inactivity, or dashboards
        that surveil anyone’s spiritual life. Encouragement, never comparison.
      </Prose>

      <ProseHeading>Want to help shape it?</ProseHeading>
      <Prose>
        If you lead a church, parish, ministry, or small group and care about
        discipleship, we’d love your honest feedback on what would actually be
        useful for your community.
      </Prose>
      <div className="not-prose pt-2">
        <GentleLink variant="dark" href="/onboarding">
          Try BibleQuest yourself
        </GentleLink>
      </div>
    </MarketingPage>
  );
}
