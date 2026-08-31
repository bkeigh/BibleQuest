import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { LEGAL_DOCUMENTS } from "@/components/legal/LegalSummary";
import {
  marketingMetadata,
  privateRouteMetadata,
} from "@/lib/metadata";

describe("search metadata", () => {
  it("publishes canonical social metadata for marketing pages", () => {
    const metadata = marketingMetadata({
      title: "About",
      description: "About BibleQuest.",
      path: "/about",
    });

    expect(metadata.alternates).toEqual({ canonical: "/about" });
    expect(metadata.openGraph).toMatchObject({
      title: "About — BibleQuest",
      url: "/about",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
    });
  });

  it("keeps private routes out of search and social previews", () => {
    const metadata = privateRouteMetadata("Account", "/app/account");

    expect(metadata.alternates).toEqual({ canonical: "/app/account" });
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    });
    expect(metadata.openGraph).toBeNull();
    expect(metadata.twitter).toBeNull();
  });

  it("blocks crawlers from app, auth, onboarding, offline, and API routes", () => {
    const output = robots();
    const rule = Array.isArray(output.rules) ? output.rules[0] : output.rules;

    expect(rule).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/onboarding", "/offline", "/auth", "/api"],
    });
    expect(output.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("lists only stable public routes in the sitemap", () => {
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);

    expect(paths).toEqual([
      "/",
      "/about",
      "/pricing",
      "/contact",
      "/support",
      "/churches",
      "/writing",
      "/privacy",
      "/terms",
    ]);
    expect(paths).not.toContain("/app");
    expect(paths).not.toContain("/onboarding");
  });
});

describe("launch legal documents", () => {
  it("uses final document names and an effective date", () => {
    expect(LEGAL_DOCUMENTS.privacy.title).toBe("Privacy Policy");
    expect(LEGAL_DOCUMENTS.terms.title).toBe("Terms of Use");
    expect(LEGAL_DOCUMENTS.privacy.effectiveDate).toBe("August 30, 2026");
    expect(LEGAL_DOCUMENTS.terms.effectiveDate).toBe("August 26, 2026");
  });

  it("covers launch-critical privacy and terms topics", () => {
    // Joins the policy copy so sensitive-content disclosure cannot silently regress.
    const privacyCopy = LEGAL_DOCUMENTS.privacy.sections
      .map((section) => section.body)
      .join(" ");
    const privacySections = LEGAL_DOCUMENTS.privacy.sections.map(
      (section) => section.title,
    );
    const termsSections = LEGAL_DOCUMENTS.terms.sections.map(
      (section) => section.title,
    );

    expect(privacySections).toEqual(
      expect.arrayContaining([
        "How long information is kept",
        "Signing in with Apple",
        "Your choices and rights",
        "Deleting app data or an account",
        "Children and teens",
        "Contact",
      ]),
    );
    expect(privacyCopy).toContain("religious or philosophical beliefs");
    expect(privacyCopy).toContain("explicitly choose to adopt");
    expect(termsSections).toEqual(
      expect.arrayContaining([
        "Who may use BibleQuest",
        "Your content",
        "Plus purchases and one-time support",
        "Disclaimers and responsibility",
        "Contact",
      ]),
    );
  });

  it("contains no pre-launch legal placeholders", () => {
    const intros = [
      LEGAL_DOCUMENTS.privacy.intro,
      LEGAL_DOCUMENTS.terms.intro,
    ].join(" ");

    expect(intros).not.toMatch(
      /formal policy|formal terms|accompany public launch|early summary/i,
    );
  });
});
