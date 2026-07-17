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
        We never sell your personal data. Analytics are off by default and run
        only after you choose to share limited usage counts in Settings. They
        never include prayer, reflection, note, or verse text; email, phone,
        user or record IDs; auth tokens; URL queries or hashes; or anything else
        you write. Your private text is never sent to analytics or logs, and is
        never used to train or prompt AI without your explicit action and consent.
      </Prose>

      <ProseHeading>If you enable analytics</ProseHeading>
      <Prose>
        BibleQuest sends allowlisted event names and small bounded values directly
        to Plausible. URLs are reduced to safe route shapes and requests send no
        referrer. Offline retries are capped and sanitized. Turning analytics off
        clears pending events immediately and keeps them off across tabs and future
        sessions. Browser Do Not Track and Global Privacy Control are respected.
      </Prose>

      <ProseHeading>If you join the waitlist</ProseHeading>
      <Prose>
        The name and email address you choose to submit are sent directly to
        Tally, which hosts our temporary pre-launch form, so we can contact you
        about BibleQuest. Waitlist details are not included in app analytics,
        and the form does not ask for prayers, reflections, or other spiritual
        journal content.
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
        concern in the meantime, email{" "}
        <a
          href="mailto:hello@biblequest.co"
          className="text-accent underline underline-offset-4"
        >
          hello@biblequest.co
        </a>
        .
      </Prose>
    </MarketingPage>
  );
}
