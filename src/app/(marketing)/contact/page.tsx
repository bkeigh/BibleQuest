import Link from "next/link";
import {
  MarketingPage,
  Prose,
  ProseHeading,
} from "@/components/marketing/MarketingPage";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/brand";
import { marketingMetadata } from "@/lib/metadata";

export const metadata = marketingMetadata({
  title: "Contact and Support",
  description:
    "Contact BibleQuest support for app help, privacy questions, or account and data requests.",
  path: "/contact",
});

/** Gives App Store customers a real support destination without a purchase CTA. */
export default function ContactPage() {
  return (
    <MarketingPage
      eyebrow="Support"
      title="How can we help?"
      intro="Questions, technical trouble, privacy requests, and feedback are welcome."
    >
      <ProseHeading>Email support</ProseHeading>
      <Prose>
        Write to{" "}
        <a
          href={SUPPORT_EMAIL_HREF}
          className="text-accent underline underline-offset-4"
        >
          {SUPPORT_EMAIL}
        </a>
        . For a technical issue, include your iPhone model, iOS version, and the
        steps that led to the problem. Please do not email private prayer or
        journal text unless it is necessary for your request.
      </Prose>

      <ProseHeading>Privacy and data</ProseHeading>
      <Prose>
        BibleQuest 1.0 stores your journey locally and does not send it to
        BibleQuest servers. iOS may include app data in device backups. Settings
        lets you export or clear it. For a privacy question or an account created
        in an earlier version, email the address above from the relevant account
        address so the request can be verified.
      </Prose>
      <Prose>
        Read the <Link href="/privacy">Privacy Policy</Link> and{" "}
        <Link href="/terms">Terms of Use</Link> for complete details.
      </Prose>

      <ProseHeading>Safety</ProseHeading>
      <Prose>
        BibleQuest is not an emergency, crisis, medical, or counseling service.
        If you or someone else may be in immediate danger, contact local
        emergency services or a qualified local professional.
      </Prose>
    </MarketingPage>
  );
}
