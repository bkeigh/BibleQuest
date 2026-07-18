import {
  MarketingPage,
  Prose,
  ProseHeading,
} from "@/components/marketing/MarketingPage";

export const metadata = {
  title: "About",
  description:
    "BibleQuest helps Christians grow closer to God through Scripture, prayer, reflection, and small daily acts of faith — without shame, pressure, or noise.",
};

export default function AboutPage() {
  return (
    <MarketingPage
      eyebrow="Why we’re building this"
      title="Faith should not feel like homework."
      intro="BibleQuest exists because spiritual growth is often treated like a content problem, when for many people it is really a direction problem."
    >
      <Prose>
        Most people don’t lack access to Scripture. They lack rhythm. They lack
        a clear next step — one they can actually take today.
      </Prose>
      <Prose>
        So BibleQuest is built around a simple idea: open the app, spend a few
        honest minutes with God, then close it and live differently. Read
        Scripture, pray plainly, reflect, and act with kindness.
      </Prose>

      <ProseHeading>What we measure</ProseHeading>
      <Prose>
        Not screen time. Not how long your candle has burned. The thing worth
        measuring is whether someone prayed when they otherwise wouldn’t have,
        forgave when they’d have held resentment, or served someone when they’d
        have looked away. The best version of BibleQuest helps you leave the app
        and live your faith.
      </Prose>

      <ProseHeading>What we won’t do</ProseHeading>
      <Prose>
        We won’t weaponize guilt. We won’t imply that God’s love depends on app
        activity. We won’t build a holiness leaderboard, and we won’t pretend to
        replace church, clergy, community, or professional care. Prayer and
        reflection are treated as sacred and private.
      </Prose>

      <ProseHeading>On Scripture and AI</ProseHeading>
      <Prose>
        BibleQuest is a Christian product that aims to be humble and broadly
        welcoming — Catholic, Orthodox, Protestant, non-denominational, or simply
        exploring. Scripture is presented plainly (with the public-domain World
        English Bible bundled offline and optional licensed editions clearly
        attributed). Any future AI features will be a study companion,
        never a stand-in for God, clergy, or a counselor — and we’ll say so
        clearly.
      </Prose>

      <ProseHeading>Still early</ProseHeading>
      <Prose>
        BibleQuest is in active development, built in the open. If the daily rhythm
        of read, pray, reflect, and act sounds like something you’ve been looking
        for, we’d be glad to have you begin.
      </Prose>
    </MarketingPage>
  );
}
