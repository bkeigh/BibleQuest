import type { ReactNode } from "react";

export type LegalDocumentKind = "privacy" | "terms";

interface LegalSection {
  title: string;
  body: ReactNode;
}

interface LegalDocument {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}

// Keeps the onboarding dialog and public policy pages on one plain-language source.
export const LEGAL_DOCUMENTS: Record<LegalDocumentKind, LegalDocument> = {
  privacy: {
    eyebrow: "Privacy",
    title: "Your prayers are yours.",
    intro:
      "This plain-language summary reflects how BibleQuest handles data today. A formal policy will accompany public launch.",
    sections: [
      {
        title: "Where your data lives",
        body:
          "Without an account, your prayers, reflections, quests, bookmarks, and journey stay in this browser on your device. If you sign in, saved app data also syncs to your BibleQuest account. You can export or clear it from Settings.",
      },
      {
        title: "What we never do",
        body:
          "We never sell your personal data. Analytics are off by default and never include prayer, reflection, note, or verse text; contact details; account or record IDs; auth tokens; URL queries or hashes; or anything else you write. Your private text is never used to train or prompt AI without your explicit action and consent.",
      },
      {
        title: "If you enable analytics",
        body:
          "BibleQuest sends allowlisted event names and small bounded values directly to Plausible. URLs are reduced to safe route shapes and requests send no referrer. Turning analytics off clears pending events. Browser Do Not Track and Global Privacy Control are respected.",
      },
      {
        title: "If you join the waitlist",
        body:
          "The name and email address you choose to submit go directly to Tally, which hosts the temporary pre-launch form. The form does not ask for prayers, reflections, or other spiritual journal content.",
      },
      {
        title: "Online Bible editions",
        body:
          "For a reviewed public-domain edition, BibleQuest asks the HelloAO Free Use Bible API only for the requested passage. For a separately licensed edition, API.Bible receives the passage plus random device and session identifiers required to report that its text was viewed. Neither provider receives your name, account ID, prayers, or reflections. Choosing bundled WEB avoids either request.",
      },
      {
        title: "If you create an account",
        body:
          "Synced journal content uses per-user database access controls. Account sync is not end-to-end encrypted, so BibleQuest does not claim that infrastructure operators or someone with access to your unlocked device could never access readable content.",
      },
      {
        title: "Sensitive moments",
        body:
          "BibleQuest is a spiritual companion, not a crisis service. If you are in danger or distress, reach out to trusted people, a pastor or priest, a professional, or local emergency services.",
      },
      {
        title: "Questions",
        body: (
          <>
            Email{" "}
            <a
              href="mailto:hello@biblequest.co"
              className="text-accent underline underline-offset-4"
            >
              hello@biblequest.co
            </a>
            .
          </>
        ),
      },
    ],
  },
  terms: {
    eyebrow: "Terms",
    title: "A few honest terms.",
    intro:
      "This is an early, plain-language summary. Formal terms will accompany public launch.",
    sections: [
      {
        title: "What BibleQuest is",
        body:
          "BibleQuest is a devotional companion for personal spiritual practice. It is provided as-is, is in active development, and may change as it grows.",
      },
      {
        title: "What it is not",
        body:
          "BibleQuest is not a church, sacrament, or authority. It does not replace pastoral care, counseling, medical or legal advice, or emergency services. Content offers encouragement and practice, not definitive rulings where faithful Christians differ.",
      },
      {
        title: "Your content",
        body:
          "Your prayers and reflections belong to you. You are responsible for what you write and how you act on suggestions. Use good judgment and prioritize your safety and the safety of others.",
      },
      {
        title: "Scripture",
        body:
          "BibleQuest bundles the public-domain World English Bible. Additional public-domain editions come from a reviewed, revision-pinned allowlist. Copyrighted editions appear only through separately licensed providers. Sources and copyright details are shown honestly, and fallback text is never labeled as the requested edition.",
      },
    ],
  },
};

// Renders policy prose without owning the surrounding page or dialog chrome.
export function LegalSummary({
  kind,
  showIntro = true,
}: {
  kind: LegalDocumentKind;
  showIntro?: boolean;
}) {
  const document = LEGAL_DOCUMENTS[kind];

  return (
    <>
      {showIntro && (
        <p className="text-small leading-relaxed text-charcoal">
          {document.intro}
        </p>
      )}
      <div className={showIntro ? "mt-6 space-y-6" : "space-y-6"}>
        {document.sections.map((section) => (
          <section key={section.title}>
            <h3 className="font-display text-[1.125rem] text-graphite">
              {section.title}
            </h3>
            <p className="mt-1.5 text-small leading-relaxed text-charcoal">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
