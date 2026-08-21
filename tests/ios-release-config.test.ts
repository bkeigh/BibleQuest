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
      "node scripts/select-ios-privacy-manifest.mjs --guest && pnpm build:native:release && pnpm exec cap sync ios && node scripts/verify-guest-ios-payload.mjs",
    );
    const verifier = source("scripts/verify-guest-ios-payload.mjs");
    expect(verifier).toContain("findGuestAccountArtifactViolation");
    expect(verifier).toContain("GUEST_RELEASE_OVERLAYS");
    expect(verifier).toContain("guest-release-provenance.json");
    expect(verifier).toContain('path.join(repo, ".native/out")');
    expect(verifier).toContain("PrivacyInfo.guest.xcprivacy");
    expect(verifier).toContain("cordova_plugins.js");
    expect(verifier).toContain("no emitted web account machinery");
    expect(verifier).toContain("native Swift is outside this web-payload check");
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

    // The public request path carries no account authority. It was renamed
    // from nativePublicApiFetch when the browser transport landed and now also
    // drops cookies outright, so the guest build cannot send ambient identity.
    expect(api).toContain("return publicApiFetch(url, init);");
    // Pin the public body itself: "credentials" also appears on the account
    // paths, so a bare substring would still match if this one lost it.
    expect(api).toMatch(
      /function publicApiFetch\([\s\S]{0,160}?return fetch\(url, \{\s*\.\.\.init,\s*credentials: "omit",\s*headers: publicHeaders\(init\?\.headers\),\s*\}\);/,
    );
    expect(api).toContain('headers.delete(reserved);');
    expect(api).toContain('RESERVED_ACCOUNT_HEADERS = ["authorization"]');
    expect(api).toContain('BIBLEQUEST_AUTHORITY_HEADER_PREFIX = "x-biblequest-"');
    expect(
      api.indexOf(
        "if (ACCOUNT_SYNC_CONTAINED || !NATIVE_ACCOUNT_BETA_ENABLED)",
      ),
    ).toBeLessThan(
      api.indexOf('await import(\n    "@/lib/supabase/client"'),
    );
    // The browser-owned auth transport is reachable only through the exact
    // non-native branch; a native build always takes the contained path.
    expect(api).toMatch(
      /if \(!isNativeTarget\(\)\) \{\s*headers\.set\(WEB_AUTH_PROTOCOL_HEADER, WEB_AUTH_PROTOCOL_VERSION\);\s*return webAuthenticatedApiFetch\(url, expectedUserId, init, headers\);\s*\}\s*return nativeAuthenticatedApiFetch\(url, expectedUserId, init, headers\);/,
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
    // CSS owns the safe areas, so UIKit must not stack a second content inset.
    expect(config).toContain('contentInset: "never"');
    expect(config).not.toContain('contentInset: "always"');
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

  it("uses the reviewed open book across native and in-app startup", () => {
    const packageJson = JSON.parse(source("package.json")) as {
      scripts: Record<string, string>;
    };
    const capacitorConfig = source("capacitor.config.ts");
    const generator = source("scripts/build-ios-splash.mjs");
    const assetCatalog = source(
      "ios/App/App/Assets.xcassets/Splash.imageset/Contents.json",
    );
    const launchScreen = source("ios/App/App/Base.lproj/LaunchScreen.storyboard");
    const fallback = source(
      "src/components/app-shell/AppLoadingScreen.tsx",
    );
    const nativeGuard = source(
      "src/components/app-shell/NativeJourneyGuard.tsx",
    );
    const onboardingGate = source(
      "src/components/onboarding/OnboardingGate.tsx",
    );

    expect(packageJson.scripts["check:ios-splash"]).toBe(
      "node scripts/build-ios-splash.mjs --check",
    );
    expect(generator).toContain('"public/art/2.5d/book-open.webp"');
    expect(assetCatalog).toContain('"filename" : "book-open-768.png"');
    expect(assetCatalog).not.toContain("splash-2732x2732");
    expect(launchScreen).toContain('contentMode="scaleAspectFit"');
    expect(launchScreen).toContain('constant="256"');
    expect(capacitorConfig).toContain("showSpinner: false");
    expect(fallback).toContain('<ArtMascot name="open-book"');
    expect(fallback).toContain('className="sr-only"');
    expect(nativeGuard).toContain("return <AppLoadingScreen />");
    expect(onboardingGate).toContain("return <AppLoadingScreen />");
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

  it("keeps every workflow guest unless it is named for the replacement", () => {
    const script = source("ios/App/ci_scripts/ci_post_clone.sh");

    // Section 4: a merge to main must never silently upload an account
    // binary. Guest is the default and the account path is reachable only
    // through an exactly named workflow.
    const guestBranch = script.indexOf("pnpm ios:release:prepare");
    const accountBranch = script.indexOf("pnpm ios:account-release:prepare");
    expect(guestBranch).toBeGreaterThan(-1);
    expect(accountBranch).toBeGreaterThan(guestBranch);
    expect(script).toContain(
      'ACCOUNT_WORKFLOW_NAME="BibleQuest Account Release"',
    );
    expect(script).toContain(
      'if [[ "$current_workflow" != "$ACCOUNT_WORKFLOW_NAME" ]]; then',
    );

    // The guest branch has to terminate, or an unnamed workflow would fall
    // through and build accounts anyway.
    const guestExit = script.indexOf("exit 0", guestBranch);
    expect(guestExit).toBeGreaterThan(guestBranch);
    expect(guestExit).toBeLessThan(accountBranch);

    // A named workflow without the reviewed key must fail rather than build.
    expect(script).toContain(
      'if [[ -z "${BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY:-}" ]]; then',
    );
    expect(script).toMatch(/BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY[\s\S]*exit 1/);

    // The key is a credential input: it is written to the ignored env file,
    // never echoed.
    expect(script).not.toMatch(
      /echo[^\n]*\$BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY/,
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
