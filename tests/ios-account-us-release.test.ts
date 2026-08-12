import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAccountUsRelease } from "../scripts/check-ios-account-us-release.mjs";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";
const SUPABASE_ORIGIN = "https://prod-biblequest.supabase.co";

interface Fixture {
  root: string;
  artifact: string;
  privacy: string;
  attestation: string;
  receipt: Record<string, unknown>;
  owner: Record<string, unknown>;
}

let fixture: Fixture;

/** Builds the receipt contract owned by the future account preparation path. */
function validReceipt(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    profile: "ios-account-us-stripe-v1",
    commit: COMMIT,
    accountEnabled: true,
    privacyProfile: "account-enabled-us-v1",
    analyticsEnabled: false,
    aiEnabled: false,
    backendEnvironment: "reviewed-production",
    backendOrigin: "https://www.biblequest.co",
    supabaseOrigin: SUPABASE_ORIGIN,
    externalNavigationOrigins: [
      "https://www.biblequest.co",
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
      "https://berean.bible",
      "https://ebible.org",
    ],
    commerce: {
      purchaseUIEnabled: true,
      storefrontSource: "StoreKit.Storefront.current.countryCode",
      eligibleCountryCodes: ["USA"],
      failClosed: true,
      usesIpLocaleOrUserCountry: false,
      storeKitPurchasing: false,
      checkoutPresentation: "system-browser",
      embeddedPaymentForm: false,
      entitlementAuthority: "server",
    },
  };
}

/** Builds only non-sensitive human facts; reviewer credentials never enter it. */
function validAttestation(): Record<string, unknown> {
  const review = Object.fromEntries(
    [
      "privacyPolicyMatchesBinary",
      "providerRetentionReviewed",
      "accountDeletionMatrixPassed",
      "activeSubscriptionDeletionReviewed",
      "dataExportAndClearPassed",
      "supportTermsPrivacyReachable",
      "pricingAndRenewalCopyReviewed",
      "ageRatingCompleted",
      "contentRightsCompleted",
      "exportComplianceCompleted",
      "screenshotsMatchBuild",
      "reviewPathPassed",
      "reviewerAccountPrepared",
    ].map((name) => [name, true]),
  );
  return {
    schemaVersion: 1,
    profile: "ios-account-us-stripe-v1",
    commit: COMMIT,
    reviewedExternalOrigins: [
      "https://www.biblequest.co",
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
      "https://berean.bible",
      "https://ebible.org",
      SUPABASE_ORIGIN,
    ],
    appStoreConnect: {
      storefronts: ["USA"],
      automaticallyIncludeFutureStorefronts: false,
      privacyAnswersProfile: "account-enabled-us-v1",
      manualRelease: true,
    },
    providers: {
      stripeMode: "live",
      stripeTestObjectsSeparated: true,
      supabasePlan: "Pro",
      supabaseBackupRetentionDays: 7,
      supabaseLogRetentionDays: 7,
    },
    review,
  };
}

/** Persists the two independently owned inputs after a test mutates them. */
function saveFixture(): void {
  writeFileSync(
    path.join(fixture.artifact, "ios-account-us-release-receipt.json"),
    JSON.stringify(fixture.receipt),
  );
  writeFileSync(fixture.attestation, JSON.stringify(fixture.owner));
}

/** Runs the gate against the current isolated fixture. */
function check() {
  saveFixture();
  return checkAccountUsRelease({
    artifact: fixture.artifact,
    privacy: fixture.privacy,
    attestation: fixture.attestation,
  });
}

beforeEach(() => {
  const root = mkdtempSync(path.join(tmpdir(), "biblequest-ios-account-release-"));
  const artifact = path.join(root, "out-native");
  mkdirSync(artifact);
  const privacy = path.join(root, "PrivacyInfo.xcprivacy");
  cpSync("ios/compliance/PrivacyInfo.account-us.xcprivacy", privacy);
  const attestation = path.join(root, "attestation.json");
  fixture = {
    root,
    artifact,
    privacy,
    attestation,
    receipt: validReceipt(),
    owner: validAttestation(),
  };
  writeFileSync(
    path.join(artifact, "index.html"),
    [
      "https://www.biblequest.co/privacy",
      "https://checkout.stripe.com/c/pay/example",
      "https://billing.stripe.com/p/session/example",
      "https://berean.bible/licensing.htm",
      "https://ebible.org/Scriptures/details.php?id=eng-kjv2006",
      `${SUPABASE_ORIGIN}/auth/v1`,
    ].join("\n"),
  );
});

afterEach(() => {
  // The target was created by mkdtemp inside the operating-system temp root.
  rmSync(fixture.root, { recursive: true, force: true });
});

describe("account-enabled US iOS release gate", () => {
  it("passes a complete account profile with independent owner evidence", () => {
    expect(check()).toMatchObject({ issues: [], files: 2, origins: 6 });
  });

  it("rejects guest privacy answers and the guest-only manifest", () => {
    fixture.receipt.privacyProfile = "guest-only-v1";
    (fixture.owner.appStoreConnect as Record<string, unknown>).privacyAnswersProfile =
      "guest-only-v1";
    cpSync("ios/compliance/PrivacyInfo.guest.xcprivacy", fixture.privacy);

    const issues = check().issues.join("\n");
    expect(issues).toContain("still uses guest privacy answers");
    expect(issues).toContain("still describes a guest-only build");
    expect(issues).toContain("omits NSPrivacyCollectedDataTypeEmailAddress");
  });

  it("rejects a non-US or non-StoreKit storefront gate", () => {
    const commerce = fixture.receipt.commerce as Record<string, unknown>;
    commerce.storefrontSource = "Locale.current.region";
    commerce.eligibleCountryCodes = ["USA", "CAN"];
    commerce.usesIpLocaleOrUserCountry = true;
    (fixture.owner.appStoreConnect as Record<string, unknown>).storefronts = [
      "USA",
      "CAN",
    ];

    const issues = check().issues.join("\n");
    expect(issues).toContain("sourced only from StoreKit storefront state");
    expect(issues).toContain("limited to the United States storefront");
    expect(issues).toContain("availability is not United States only");
  });

  it.each([
    ["staging host", "https:\\u002f\\u002fnative-staging.biblequest.co/api"],
    ["analytics transport", "https://plausible.io/api/event"],
    ["embedded Stripe form", "https://js.stripe.com/v3"],
  ])("rejects a %s marker", (label, marker) => {
    writeFileSync(path.join(fixture.artifact, "unsafe.js"), marker);
    expect(check().issues.join("\n")).toContain(label);
  });

  it("rejects a destination that the release owner did not review", () => {
    writeFileSync(
      path.join(fixture.artifact, "new-link.html"),
      '<a href="https://unexpected.example/purchase">Buy</a>',
    );

    expect(check().issues).toContain(
      "artifact contains an unreviewed external origin: https://unexpected.example",
    );
  });

  it("keeps the guest submission and manifest independently guest-only", () => {
    const guestPackage = readFileSync("docs/APP_STORE_SUBMISSION.md", "utf8");
    const guestManifest = readFileSync(
      "ios/compliance/PrivacyInfo.guest.xcprivacy",
      "utf8",
    );
    const entitlements = readFileSync("ios/App/App/App.entitlements", "utf8");
    const project = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");

    expect(guestPackage).toContain("guest-only iPhone release");
    expect(guestManifest).toContain("shipping build is\n\tguest-only");
    expect(guestManifest).toMatch(
      /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/,
    );
    expect(entitlements).not.toContain("ExternalPurchase");
    expect(project).not.toContain("PrivacyInfo.account-us.xcprivacy");
  });

  it("pins the account build target and signed native bridge receipt", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const policy = JSON.parse(
      readFileSync("config/ios-account-us-release.json", "utf8"),
    );
    const swift = readFileSync(
      "ios/App/App/BibleQuestCommercePlugin.swift",
      "utf8",
    );

    expect(packageJson.scripts["ios:account-us:prepare"]).toContain(
      "scripts/select-ios-privacy-manifest.mjs --account-us",
    );
    expect(policy.buildTarget).toMatchObject({
      reviewed: true,
      hostedOrigin: "https://www.biblequest.co",
      supabaseOrigin: "https://iacnjqnssovaaojswjoh.supabase.co",
    });
    expect(swift).toContain("ios-account-us-release-receipt");
    expect(swift).toContain(
      'commerce["storeKitPurchasing"] as? Bool == false',
    );
    const builder = readFileSync("scripts/build-native.mjs", "utf8");
    expect(builder).toContain(
      "account-US receipts require a clean, committed source tree.",
    );
  });
});
