import { readFileSync, statSync } from "node:fs";
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
      'NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED: "false"',
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

  it("locks version 1.0 to the iPhone device family", () => {
    const project = source("ios/App/App.xcodeproj/project.pbxproj");
    const plist = source("ios/App/App/Info.plist");

    expect(project.match(/CURRENT_PROJECT_VERSION = 4;/g)).toHaveLength(2);
    expect(project.match(/TARGETED_DEVICE_FAMILY = 1;/g)).toHaveLength(2);
    expect(project).not.toContain('TARGETED_DEVICE_FAMILY = "1,2";');
    expect(project.match(/MARKETING_VERSION = 1\.0;/g)).toHaveLength(2);
    expect(project.match(/PRODUCT_BUNDLE_IDENTIFIER = co\.biblequest\.app;/g)).toHaveLength(2);
    expect(plist).toMatch(
      /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/,
    );
    expect(plist).not.toContain("UISupportedInterfaceOrientations~ipad");
    expect(plist).not.toMatch(/<key>NSCameraUsageDescription<\/key>/);
  });

  it("keeps account, billing, and marketing acquisition dormant", () => {
    const api = source("src/lib/platform/api.ts");
    const billing = source("src/lib/billing/usePlus.ts");
    const settings = source("src/components/settings/SettingsScreen.tsx");

    expect(api).toContain("return nativePublicApiFetch(url, init);");
    expect(api).toContain('headers.delete(reserved);');
    expect(api).toContain('"authorization",');
    expect(
      api.indexOf(
        "if (ACCOUNT_SYNC_CONTAINED || !NATIVE_ACCOUNT_BETA_ENABLED)",
      ),
    ).toBeLessThan(
      api.indexOf('await import(\n    "@/lib/supabase/client"'),
    );
    expect(billing).toContain("if (NATIVE_COMMERCE_CONTAINED) return;");
    expect(settings).toMatch(
      /\{!nativeTarget \? \([\s\S]*?BibleQuest website[\s\S]*?\) : null\}/,
    );
  });

  it("protects private snapshots, files, and native accessibility choices", () => {
    const project = source("ios/App/App.xcodeproj/project.pbxproj");
    const entitlements = source("ios/App/App/App.entitlements");
    const scene = source("ios/App/App/SceneDelegate.swift");
    const authStorage = source("src/lib/supabase/native-auth-storage.ts");
    const config = source("capacitor.config.ts");
    const privacy = source("ios/App/App/PrivacyInfo.xcprivacy");

    expect(project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g))
      .toHaveLength(2);
    expect(entitlements).toContain("NSFileProtectionComplete");
    expect(scene).toContain("func sceneDidEnterBackground");
    expect(scene).toContain("showPrivacyCover()");
    expect(scene).toContain("UIAccessibility.isBoldTextEnabled");
    const swiftPrefix = scene.match(/authKeyPrefix = "([^"]+)"/)?.[1];
    const storagePrefix = authStorage.match(
      /AUTH_KEY_PREFIX = "([^"]+)"/,
    )?.[1];
    expect(swiftPrefix).toBe("biblequest_auth_");
    expect(swiftPrefix).toBe(storagePrefix);
    expect(scene).toContain("SecItemDelete");
    expect(scene).toContain("authInstallMarker");
    expect(scene).toContain(".applicationSupportDirectory");
    expect(scene).not.toContain("UserDefaults");
    expect(privacy).toContain("NSPrivacyAccessedAPICategoryFileTimestamp");
    expect(privacy).toContain("C617.1");
    expect(privacy).not.toContain("NSPrivacyAccessedAPICategoryUserDefaults");
    expect(privacy).not.toContain("CA92.1");
    expect(config).toContain('preferredContentMode: "mobile"');
    expect(config).toContain("LocalNotifications:");
  });

  it("purges obsolete plaintext native auth on every app startup", () => {
    const startup = source(
      "src/components/app-shell/NativeJourneyGuard.tsx",
    );
    const layout = source("src/app/layout.tsx");
    const storage = source("src/lib/supabase/native-auth-storage.ts");

    expect(startup).toContain("clearLegacyNativeAuthStorage()");
    expect(startup).toContain("await restoreJourneyIfEvicted()");
    expect(startup).toContain("await useQuestOS.persist.rehydrate()");
    expect(startup.indexOf("await restoreJourneyIfEvicted()")).toBeLessThan(
      startup.indexOf("startJourneyBackup()"),
    );
    expect(layout).toMatch(
      /<NativeJourneyGuard>\s*\{children\}[\s\S]*?<\/NativeJourneyGuard>/,
    );
    expect(storage).toContain('"biblequest:native-auth-cookies"');
    expect(storage).toContain("storage ?? window.localStorage");
  });

  it("prunes web-only workers and acquisition media from the native stage", () => {
    const builder = source("scripts/build-native.mjs");
    const registrar = source(
      "src/components/app-shell/ServiceWorkerRegistrar.tsx",
    );

    expect(builder).toContain('"--exclude=/public/marketing/"');
    expect(builder).toContain('"--exclude=/public/sw.js"');
    expect(builder).toContain('["src/app/offline"');
    expect(builder).toContain(
      'turbopack: { root: path.resolve(process.cwd(), "..") }',
    );
    expect(registrar).toContain("isNativeTarget() ||");
  });

  it("compiles native CI with an Icon Composer-capable Xcode", () => {
    const workflow = source(".github/workflows/ci.yml");

    expect(workflow).toContain("DEVELOPER_DIR: /Applications/Xcode_26.3.app");
    expect(workflow).toContain("-configuration Release");
    expect(workflow).toContain("-disableAutomaticPackageResolution");
  });

  it("prepares Xcode Cloud dependencies before its archive action", () => {
    const scriptPath = "ios/App/ci_scripts/ci_post_clone.sh";
    const script = source(scriptPath);

    expect(statSync(scriptPath).mode & 0o111).not.toBe(0);
    expect(script.startsWith("#!/bin/zsh\nset -euo pipefail")).toBe(true);
    expect(script).toContain("CI_PRIMARY_REPOSITORY_PATH");
    expect(script).toContain("brew install node@24");
    expect(script).toContain("corepack prepare pnpm@11.10.0 --activate");
    expect(script).toContain(
      'cloud_build_number="${CI_BUILD_NUMBER:?CI_BUILD_NUMBER is required}"',
    );
    expect(script).toContain(
      'xcrun agvtool new-version -all "$cloud_build_number"',
    );
    expect(script).toContain("pnpm install --frozen-lockfile");
    expect(script).toContain("pnpm ios:release:prepare");
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
