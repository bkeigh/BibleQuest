import { MarketingPage } from "@/components/marketing/MarketingPage";
import {
  LEGAL_DOCUMENTS,
  LegalSummary,
} from "@/components/legal/LegalSummary";
import { marketingMetadata } from "@/lib/metadata";

const policy = LEGAL_DOCUMENTS.privacy;

export const metadata = marketingMetadata({
  title: "Privacy Policy",
  description:
    "How BibleQuest and Winterhill Studio collect, use, protect, retain, and delete account and app information.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Privacy"
      title={policy.title}
      intro={policy.intro}
    >
      <p className="text-caption font-medium uppercase tracking-[0.08em] text-accent">
        Effective {policy.effectiveDate}
      </p>
      <LegalSummary kind="privacy" showIntro={false} headingLevel={2} />
    </MarketingPage>
  );
}
