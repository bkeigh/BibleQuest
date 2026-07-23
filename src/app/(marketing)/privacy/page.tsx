import {
  MarketingPage,
} from "@/components/marketing/MarketingPage";
import { LegalSummary } from "@/components/legal/LegalSummary";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Privacy"
      title="Your prayers are yours."
      intro="This is a plain-language summary of how BibleQuest handles your data. It reflects how the app works today; a formal policy will accompany public launch."
    >
      <LegalSummary kind="privacy" showIntro={false} />
    </MarketingPage>
  );
}
