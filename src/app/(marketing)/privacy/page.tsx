import {
  MarketingPage,
  Prose,
  ProseHeading,
} from "@/components/marketing/MarketingPage";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Privacy"
      title="Your prayers are yours."
      intro="This is a plain-language summary of how BibleQuest handles your data. It reflects how the app works today; a formal policy will accompany public launch."
    >
      <ProseHeading>Where your data lives</ProseHeading>
      <Prose>
        Today, BibleQuest runs on your device. Your prayers, reflections, quests,
        bookmarks, and journey are stored locally in your browser — for you. You
        can export everything to a file, or clear it entirely, from Settings.
      </Prose>

      <ProseHeading>What we never do</ProseHeading>
      <Prose>
        We never sell your personal data. Analytics — if enabled — count actions
        like “a reflection was written,” never the words you wrote. The text of
        your prayers and reflections is never sent to analytics or logs, and is
        never used to train or prompt AI without your explicit action and consent.
      </Prose>

      <ProseHeading>If you create an account later</ProseHeading>
      <Prose>
        When account sync becomes available, your private content will be
        protected by database-level security so that only you can read it. The
        keys that could bypass that protection are server-only and never reach
        your browser.
      </Prose>

      <ProseHeading>Sensitive moments</ProseHeading>
      <Prose>
        BibleQuest is a spiritual companion, not a crisis service. If you are in
        danger or distress, please reach out to trusted people, a pastor or
        priest, a professional, or local emergency services. We’ll always point
        you toward real help rather than pretend to be it.
      </Prose>

      <ProseHeading>Questions</ProseHeading>
      <Prose>
        This policy will grow more formal before public launch. If you have a
        concern in the meantime, please reach out through the site.
      </Prose>
    </MarketingPage>
  );
}
