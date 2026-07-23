import type { ReactNode } from "react";
import { ACCOUNT_SYNC_CONTAINED } from "@/lib/sync/containment";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/brand";

export type LegalDocumentKind = "privacy" | "terms";

interface LegalSection {
  title: string;
  body: ReactNode;
}

interface LegalDocument {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
}

// Keeps every legal surface truthful while production account sync is contained.
const ACCOUNT_STORAGE_COPY = ACCOUNT_SYNC_CONTAINED
  ? "Account sync is temporarily unavailable, so new app data currently stays in this browser on this device."
  : "When you sign in, app data can sync to your protected BibleQuest account so it is available across devices.";

const ACCOUNT_SECURITY_COPY = ACCOUNT_SYNC_CONTAINED
  ? "If you previously created an account, its account and app records remain subject to this policy while account sync is unavailable."
  : "Synced app records use per-user database access controls so one account cannot read another account’s rows.";

const ContactLink = () => (
  <a
    href={SUPPORT_EMAIL_HREF}
    className="text-accent underline underline-offset-4"
  >
    {SUPPORT_EMAIL}
  </a>
);

// Keeps onboarding dialogs and public policy pages on one launch-ready source.
export const LEGAL_DOCUMENTS: Record<LegalDocumentKind, LegalDocument> = {
  privacy: {
    eyebrow: "Privacy",
    title: "Privacy Policy",
    effectiveDate: "July 23, 2026",
    intro:
      "BibleQuest is a product of Winterhill Studio. This policy explains what we collect, why we use it, and the choices you have.",
    sections: [
      {
        title: "What this policy covers",
        body:
          "This policy covers BibleQuest’s website, progressive web app, account features, support, and related services. It does not control a third party’s own website or service, even when BibleQuest links to it.",
      },
      {
        title: "Information you choose to provide",
        body:
          "You may provide an email address and display name for an account; prayers, reflections, notes, bookmarks, quests, reading progress, settings, and Journey activity; and messages you send to support. Prayer and reflection text is sensitive personal content. BibleQuest does not require a denomination, legal name, precise location, or contact list.",
      },
      {
        title: "Information created when you use BibleQuest",
        body: `Without an account, app data is stored in your browser on your device. ${ACCOUNT_STORAGE_COPY} We may also receive limited technical information needed to authenticate you, prevent abuse, deliver requested passages, complete a purchase or donation, and keep the service reliable. ${ACCOUNT_SECURITY_COPY}`,
      },
      {
        title: "How we use information",
        body:
          "We use information to provide and sync the features you request, remember your settings, restore your Journey, authenticate accounts, process support requests and payments, protect the service, diagnose failures, meet legal obligations, and improve BibleQuest. We do not sell personal information, use prayer or reflection text for advertising, or use private writing to train or prompt AI without a separate, explicit choice.",
      },
      {
        title: "Analytics are optional",
        body:
          "Analytics are off until you opt in. If enabled, BibleQuest sends allowlisted event names and small bounded values to Plausible. It excludes prayer, reflection, note, and verse text; names and contact details; account and record IDs; authentication tokens; and URL queries or hashes. Turning analytics off clears pending events. We also respect browser Do Not Track and Global Privacy Control signals.",
      },
      {
        title: "Service providers",
        body:
          "We use service providers only for defined tasks: Supabase for authentication and protected account storage; Vercel for hosting and operational delivery; Plausible for optional analytics; RevenueCat and Stripe for optional purchases or donations; Tally for the temporary waitlist; and reviewed Bible providers for requested online editions. Providers process information under their own terms and privacy notices. Bible requests do not include your prayers, reflections, name, or BibleQuest account ID.",
      },
      {
        title: "Online Bible editions",
        body:
          "BibleQuest can request a passage from the HelloAO Free Use Bible API for reviewed open editions. For a separately licensed edition, API.Bible may receive the requested passage and random device or session identifiers required for usage reporting. Choosing the bundled World English Bible avoids a third-party Scripture request.",
      },
      {
        title: "How long information is kept",
        body:
          "Device-only data remains until you clear it, remove the app’s browser storage, or lose access to that device. Account and support records remain while needed to provide the service, resolve a request, protect against abuse, or meet legal duties. When deletion is completed, information is removed from active systems; limited copies may remain temporarily in access-restricted backups until they roll off through the provider’s normal backup cycle.",
      },
      {
        title: "Your choices and rights",
        body:
          "Settings lets you export readable app data, clear app data, choose whether to use analytics, and change app preferences. Depending on where you live, you may also ask to access, correct, delete, restrict, or receive a copy of personal information, or object to or withdraw consent for certain processing. We will not discriminate against you for making a privacy request.",
      },
      {
        title: "Deleting app data or an account",
        body: (
          <>
            “Clear my data” removes app content from this device and, when
            signed in and sync is available, requests deletion of synced app
            records. It does not by itself close the login identity. When
            account access is available, a signed-in person can use “Delete
            account” in Settings to close the login identity and delete its
            synced app records. If that control is unavailable or you need help,
            email <ContactLink /> from the account email. We may verify an email
            request and will aim to complete it within 30 days unless law
            requires otherwise.
          </>
        ),
      },
      {
        title: "Security and international processing",
        body:
          "We use encryption in transit, access controls, limited production access, and service monitoring designed to protect information. No online service or device storage is completely secure, and account sync is not end-to-end encrypted. Our providers may process information in countries other than your own, subject to the protections required by applicable law.",
      },
      {
        title: "Children and teens",
        body:
          "BibleQuest is not directed to children under 13. If local law requires parental consent for a young person to use an online service, they should use BibleQuest only with that consent. We do not knowingly collect personal information from a child who cannot legally provide it. A parent or guardian may contact us to request review or deletion.",
      },
      {
        title: "Changes to this policy",
        body:
          "We may update this policy as BibleQuest changes. We will post the new effective date here and provide additional notice before a material change when required. Continued use after the effective date means the updated policy applies, subject to rights that cannot lawfully be waived.",
      },
      {
        title: "Contact",
        body: (
          <>
            Privacy questions and requests may be sent to Winterhill Studio at{" "}
            <ContactLink />.
          </>
        ),
      },
    ],
  },
  terms: {
    eyebrow: "Terms",
    title: "Terms of Use",
    effectiveDate: "July 23, 2026",
    intro:
      "These Terms of Use are an agreement between you and Winterhill Studio for your use of BibleQuest.",
    sections: [
      {
        title: "Accepting these terms",
        body:
          "By creating an account, opening BibleQuest, or using its services, you agree to these terms and acknowledge the Privacy Policy. If you do not agree, do not use the service. Rights that applicable law does not allow you to waive remain in place.",
      },
      {
        title: "Who may use BibleQuest",
        body:
          "You must be at least 13 and legally able to agree to these terms. If the law where you live requires a parent or guardian’s consent, you may use BibleQuest only with that consent. A parent or guardian who permits use is responsible for supervising it.",
      },
      {
        title: "What BibleQuest is",
        body:
          "BibleQuest is a devotional companion for Scripture, prayer, reflection, and everyday acts of faith. It is not a church, sacrament, clergy member, crisis service, counselor, or source of medical, legal, financial, or emergency advice. Use your judgment and seek qualified or local help when needed.",
      },
      {
        title: "Your account",
        body:
          "Provide accurate account information, keep access to your email and devices secure, and tell us promptly if you believe your account has been misused. You are responsible for activity through your account unless applicable law says otherwise. One person may not impersonate another or use BibleQuest to access another person’s information.",
      },
      {
        title: "Your content",
        body:
          "Your prayers, reflections, and other original writing remain yours. You give Winterhill Studio only the limited permission needed to host, process, sync, back up, and display that content back to you, and to secure and operate BibleQuest. This permission ends when the content is deleted from active systems, subject to temporary restricted backups and legal obligations. Private writing is not licensed for advertising or AI training.",
      },
      {
        title: "A personal-use license",
        body:
          "Winterhill Studio gives you a limited, personal, non-exclusive, non-transferable, revocable license to use BibleQuest as intended while these terms apply. BibleQuest’s design, software, original writing, artwork, trademarks, and other materials remain owned by Winterhill Studio or their licensors.",
      },
      {
        title: "Respectful and lawful use",
        body:
          "Do not misuse BibleQuest, interfere with its security or operation, probe another person’s data, automate abusive traffic, introduce malicious code, evade usage limits, impersonate someone, violate intellectual-property or privacy rights, or use the service for unlawful, threatening, exploitative, or harmful conduct. Do not rely on a quest when it would be unsafe or unlawful in your circumstances.",
      },
      {
        title: "Scripture and third-party services",
        body:
          "BibleQuest bundles the public-domain World English Bible and identifies other editions, sources, licenses, and fallbacks in context. Third-party Bible, authentication, payment, and form services have their own terms. A link or integration does not mean BibleQuest controls or endorses everything on that service.",
      },
      {
        title: "Plus, purchases, and donations",
        body:
          "The core BibleQuest experience is free. If Plus or another paid feature becomes available, the purchase screen will show the price, billing period, renewal terms, and cancellation method before you pay. Payment providers may handle billing and refunds under their terms and applicable law. Donations are voluntary, do not purchase spiritual standing, and do not create a Plus membership.",
      },
      {
        title: "Availability and changes",
        body:
          "BibleQuest is in active development. We may add, change, suspend, or retire features to improve the service, comply with law, protect users, or address security and provider changes. We aim to give reasonable notice when a material change affects saved data, but uninterrupted or error-free availability is not guaranteed.",
      },
      {
        title: "Suspension and ending use",
        body:
          "You may stop using BibleQuest at any time. When account access is available, you may delete your account in Settings; email support remains available as described in the Privacy Policy. We may limit or suspend access when reasonably necessary to address abuse, security, legal requirements, or a serious breach of these terms. When practical, we will provide notice and a way to contact us.",
      },
      {
        title: "Disclaimers and responsibility",
        body:
          "BibleQuest is provided on an “as is” and “as available” basis to the extent permitted by law. Winterhill Studio does not promise a particular spiritual, personal, or health outcome. To the extent permitted by law, Winterhill Studio is not responsible for indirect, incidental, special, consequential, or punitive losses, or losses caused by circumstances outside reasonable control. These limits do not apply where the law forbids them.",
      },
      {
        title: "Questions and disputes",
        body: (
          <>
            Please contact <ContactLink /> first so we can try to resolve a
            concern informally. These terms do not remove consumer protections
            or access to a court or regulator available under the law where you
            live. Any unresolved claim must be brought in a court that has
            lawful jurisdiction.
          </>
        ),
      },
      {
        title: "Changes to these terms",
        body:
          "We may update these terms as BibleQuest changes. We will post the new effective date and give additional notice before a material change when required. If you continue using BibleQuest after the effective date, the updated terms apply; if you do not agree, you should stop using the service.",
      },
      {
        title: "Contact",
        body: (
          <>
            Questions about these terms may be sent to Winterhill Studio at{" "}
            <ContactLink />.
          </>
        ),
      },
    ],
  },
};

// Renders policy prose without owning the surrounding page or dialog chrome.
export function LegalSummary({
  kind,
  showIntro = true,
  headingLevel = 3,
}: {
  kind: LegalDocumentKind;
  showIntro?: boolean;
  headingLevel?: 2 | 3;
}) {
  const document = LEGAL_DOCUMENTS[kind];
  const SectionHeading = headingLevel === 2 ? "h2" : "h3";

  return (
    <>
      {showIntro && (
        <>
          <p className="text-caption font-medium uppercase tracking-[0.08em] text-accent">
            Effective {document.effectiveDate}
          </p>
          <p className="mt-2 text-small leading-relaxed text-charcoal">
            {document.intro}
          </p>
        </>
      )}
      <div className={showIntro ? "mt-6 space-y-6" : "space-y-6"}>
        {document.sections.map((section) => (
          <section key={section.title}>
            <SectionHeading className="font-display text-[1.125rem] text-graphite">
              {section.title}
            </SectionHeading>
            <p className="mt-1.5 text-small leading-relaxed text-charcoal">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
