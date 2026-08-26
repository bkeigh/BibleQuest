import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseArguments,
} from "../scripts/verify-ios-release-app.mjs";

/** Reads one exact native release surface for source-contract assertions. */
function source(file: string): string {
  return readFileSync(file, "utf8");
}

const fullSha = "a".repeat(40);

describe("exact iOS release app verifier", () => {
  it("accepts only one complete immutable-artifact approval contract", () => {
    expect(
      parseArguments([
        "--app",
        "/tmp/BibleQuest.app",
        "--profile",
        "account-release",
        "--expected-build",
        "41",
        "--expected-source",
        fullSha.toUpperCase(),
      ]),
    ).toEqual({
      app: "/tmp/BibleQuest.app",
      profile: "account-release",
      expectedBuild: "41",
      expectedSource: fullSha,
      allowUnsigned: false,
    });
  });

  it.each([
    [["--profile", "account-release"], "--app is required"],
    [
      [
        "--app",
        "/tmp/App.app",
        "--profile",
        "beta",
        "--expected-build",
        "41",
        "--expected-source",
        fullSha,
      ],
      "--profile must be guest or account-release",
    ],
    [
      [
        "--app",
        "/tmp/App.app",
        "--profile",
        "guest",
        "--expected-build",
        "0",
        "--expected-source",
        fullSha,
      ],
      "--expected-build must be a positive integer",
    ],
    [
      [
        "--app",
        "/tmp/App.app",
        "--profile",
        "guest",
        "--expected-build",
        "4",
        "--expected-source",
        "short",
      ],
      "--expected-source must be one full Git SHA",
    ],
  ])("rejects an incomplete or unsafe contract", (argumentsList, message) => {
    expect(() => parseArguments(argumentsList)).toThrow(message);
  });

  it("embeds the checked-out source identity before publishing native output", () => {
    const builder = source("scripts/build-native.mjs");
    const nextConfig = source("next.config.ts");

    expect(builder).toContain("native-release-identity.json");
    expect(builder).toContain("biblequest_ios_release_identity_v1");
    expect(builder.indexOf("resolveNativeSourceSha();")).toBeLessThan(
      builder.indexOf("build();"),
    );
    expect(builder.indexOf("writeNativeReleaseIdentity(")).toBeLessThan(
      builder.indexOf("publish();"),
    );
    expect(nextConfig).toContain(
      "releaseSha(process.env.BIBLEQUEST_SOURCE_SHA)",
    );
  });

  it("makes signed archive verification mandatory in Xcode Cloud", () => {
    const cloneScript = "ios/App/ci_scripts/ci_post_clone.sh";
    const postBuildScript = "ios/App/ci_scripts/ci_post_xcodebuild.sh";
    const clone = source(cloneScript);
    const postBuild = source(postBuildScript);

    expect(statSync(cloneScript).mode & 0o111).not.toBe(0);
    expect(statSync(postBuildScript).mode & 0o111).not.toBe(0);
    expect(clone).toContain("git diff --quiet");
    expect(clone).toContain('export BIBLEQUEST_SOURCE_SHA="$cloud_source_sha"');
    expect(clone).toContain('${CI_BRANCH:-}');
    expect(clone).toContain('!= "main"');
    expect(postBuild).toContain("CI_ARCHIVE_PATH");
    expect(postBuild).toContain("scripts/verify-ios-release-app.mjs");
    expect(postBuild).not.toContain("--allow-unsigned");
  });

  it("runs the same verifier against GitHub's unsigned guest compile", () => {
    const workflow = source(".github/workflows/ci.yml");

    expect(workflow).toContain("BIBLEQUEST_SOURCE_SHA: ${{ github.sha }}");
    expect(workflow).toContain("Verify the exact unsigned simulator app");
    expect(workflow).toContain("--profile guest");
    expect(workflow).toContain("--allow-unsigned");
  });
});
