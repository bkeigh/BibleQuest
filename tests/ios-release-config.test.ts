import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Reads one checked-in release surface for static configuration contracts. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("iOS App Store release configuration", () => {
  it("provides one deterministic production guest-only preparation command", () => {
    const scripts = JSON.parse(source("package.json")) as {
      scripts: Record<string, string>;
    };
    const builder = source("scripts/build-native.mjs");

    expect(scripts.scripts["build:native:release"]).toContain("--release");
    expect(scripts.scripts["ios:release:prepare"]).toBe(
      "pnpm build:native:release && pnpm exec cap sync ios",
    );
    expect(builder).toContain(
      'const RELEASE_ORIGIN = "https://www.biblequest.co"',
    );
    for (const pin of [
      'NEXT_PUBLIC_APP_PLATFORM: "native"',
      'NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED: "false"',
      'NEXT_PUBLIC_ACCOUNT_GATE_ENABLED: "false"',
      'NEXT_PUBLIC_ANALYTICS_ENABLED: "false"',
      'NEXT_PUBLIC_SUPABASE_URL: ""',
    ]) {
      expect(builder, pin).toContain(pin);
    }
    expect(builder).toContain('"native-staging.biblequest.co"');
    expect(builder).toContain('".vercel.app"');
    expect(builder.indexOf("pinReleaseEnvironment();")).toBeLessThan(
      builder.indexOf("const { origin } = requiredEnvironment();"),
    );
  });

  it("locks version 1.0 build 4 to the iPhone device family", () => {
    const project = source("ios/App/App.xcodeproj/project.pbxproj");
    const plist = source("ios/App/App/Info.plist");

    expect(project.match(/CURRENT_PROJECT_VERSION = 4;/g)).toHaveLength(2);
    expect(project.match(/TARGETED_DEVICE_FAMILY = 1;/g)).toHaveLength(2);
    expect(project).not.toContain('TARGETED_DEVICE_FAMILY = "1,2";');
    expect(project.match(/MARKETING_VERSION = 1\.0;/g)).toHaveLength(2);
    expect(project.match(/PRODUCT_BUNDLE_IDENTIFIER = co\.biblequest\.app;/g)).toHaveLength(2);
    expect(plist).toMatch(/<key>CFBundleVersion<\/key>\s*<string>4<\/string>/);
    expect(plist).not.toContain("UISupportedInterfaceOrientations~ipad");
    expect(plist).not.toMatch(/<key>NSCameraUsageDescription<\/key>/);
  });

  it("keeps account, billing, reminders, and marketing acquisition dormant", () => {
    const api = source("src/lib/platform/api.ts");
    const billing = source("src/lib/billing/usePlus.ts");
    const settings = source("src/components/settings/SettingsScreen.tsx");

    expect(api).toContain("if (ACCOUNT_SYNC_CONTAINED) return null;");
    expect(api.indexOf("if (ACCOUNT_SYNC_CONTAINED) return null;")).toBeLessThan(
      api.indexOf('await import(\n      "@/lib/supabase/client"'),
    );
    expect(billing).toContain(
      "const nativeGuestOnly = isNativeTarget() && ACCOUNT_SYNC_CONTAINED",
    );
    expect(settings).toMatch(
      /\{!nativeTarget \? \([\s\S]*?BibleQuest website[\s\S]*?\) : null\}/,
    );
  });

  it("documents a reusable App Store Connect upload and header-level CORS gate", () => {
    const runbook = source("docs/IOS_TESTFLIGHT_RUNBOOK.md");

    expect(runbook).toContain("Distribute App → App Store Connect → Upload");
    expect(runbook).toContain(
      "access-control-allow-origin: capacitor://localhost",
    );
    expect(runbook).toContain("The HTTP status alone is not a gate");
    expect(runbook).toContain("pnpm ios:release:prepare");
  });
});
