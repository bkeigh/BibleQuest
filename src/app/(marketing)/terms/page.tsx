import {
  MarketingPage,
  Prose,
  ProseHeading,
} from "@/components/marketing/MarketingPage";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Terms"
      title="A few honest terms."
      intro="This is an early, plain-language summary. Formal terms will accompany public launch."
    >
      <ProseHeading>What BibleQuest is</ProseHeading>
      <Prose>
        BibleQuest is a devotional companion offered for personal spiritual
        practice. It is provided as-is, in active development, and may change as
        it grows.
      </Prose>

      <ProseHeading>What it isn’t</ProseHeading>
      <Prose>
        BibleQuest is not a church, sacrament, or authority. It does not replace
        pastoral care, counseling, medical or legal advice, or emergency services.
        Content is offered for encouragement and practice, not as definitive
        rulings on matters where faithful Christians differ.
      </Prose>

      <ProseHeading>Your content</ProseHeading>
      <Prose>
        Your prayers and reflections belong to you. You’re responsible for what
        you write and how you act on any suggestion. Please use good judgment,
        and prioritize your safety and the safety of others.
      </Prose>

      <ProseHeading>Scripture</ProseHeading>
      <Prose>
        BibleQuest bundles the public-domain World English Bible. A selected
        copyrighted edition is shown only through a separately licensed provider,
        with its source and copyright notice displayed in context. If that
        connection is unavailable, the app clearly returns to WEB; it never labels
        WEB text as another edition.
      </Prose>
    </MarketingPage>
  );
}
