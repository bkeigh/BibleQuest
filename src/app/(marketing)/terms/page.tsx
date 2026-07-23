import {
  MarketingPage,
} from "@/components/marketing/MarketingPage";
import { LegalSummary } from "@/components/legal/LegalSummary";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Terms"
      title="A few honest terms."
      intro="This is an early, plain-language summary. Formal terms will accompany public launch."
    >
      <LegalSummary kind="terms" showIntro={false} />
    </MarketingPage>
  );
}
