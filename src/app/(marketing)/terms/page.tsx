import { MarketingPage } from "@/components/marketing/MarketingPage";
import {
  LEGAL_DOCUMENTS,
  LegalSummary,
} from "@/components/legal/LegalSummary";
import { marketingMetadata } from "@/lib/metadata";

const terms = LEGAL_DOCUMENTS.terms;

export const metadata = marketingMetadata({
  title: "Terms of Use",
  description:
    "The plain-language terms that govern accounts, content, purchases, and use of BibleQuest by Winterhill Studio.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Terms"
      title={terms.title}
      intro={terms.intro}
    >
      <p className="text-caption font-medium uppercase tracking-[0.08em] text-accent">
        Effective {terms.effectiveDate}
      </p>
      <LegalSummary kind="terms" showIntro={false} headingLevel={2} />
    </MarketingPage>
  );
}
