import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const plugin = readFileSync(
  "ios/App/App/NativeAppleSignInPlugin.swift",
  "utf8",
);
const entitlements = readFileSync("ios/App/App/App.entitlements", "utf8");
const project = readFileSync(
  "ios/App/App.xcodeproj/project.pbxproj",
  "utf8",
);
const scene = readFileSync("ios/App/App/SceneDelegate.swift", "utf8");

describe("native Apple plugin contract", () => {
  it("registers a nonce-bound AuthenticationServices flow in the app target", () => {
    expect(plugin).toContain("ASAuthorizationAppleIDProvider");
    expect(plugin).toContain("request.requestedScopes = [.email]");
    expect(plugin).toContain("request.nonce = self.sha256(nonce)");
    expect(plugin).toContain('"identityToken": token');
    expect(plugin).toContain('"nonce": nonce');
    expect(plugin).not.toContain("credential.email");
    expect(plugin).not.toContain("credential.fullName");
    expect(plugin).not.toContain("credential.user");
    expect(scene).toContain("BibleQuestBridgeViewController()");
    expect(project).toContain("NativeAppleSignInPlugin.swift in Sources");
  });

  it("declares the Apple entitlement without weakening data protection", () => {
    expect(entitlements).toContain("com.apple.developer.applesignin");
    expect(entitlements).toContain("NSFileProtectionComplete");
  });
});
