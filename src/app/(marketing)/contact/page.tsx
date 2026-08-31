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
        In the native iPhone app, guest data stays in protected local app storage
        and its private files are excluded from device backups. Signing in does
        not upload guest data. Only Prayer journal entries you explicitly adopt
        sync to your protected account; other guest data remains device-only.
        Native Settings lets you clear guest data and, when signed in, sign out
        or delete the account. The native app does not currently provide data
        export or analytics because it does not include analytics.
      </Prose>
      <Prose>
        In the website and progressive web app, signed-out journey data stays in
        that browser. Web Settings provides the available export, clearing, and
        optional analytics controls. For a privacy or account-and-data question,
        email the address above from the relevant account address when possible
        so the request can be verified.
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
