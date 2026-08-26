import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPublicMediaPath,
  nativePublicMediaAllowlist,
} from "../scripts/lib/native-media.mjs";

const repositoryRoot = process.cwd();

describe("native media rights boundary", () => {
  it("keeps one finite, existing public-media allowlist", () => {
    const files = nativePublicMediaAllowlist(repositoryRoot);

    expect(files).toHaveLength(78);
    expect(new Set(files).size).toBe(files.length);
    expect(files.every(isPublicMediaPath)).toBe(true);
    expect(files.every((file) => existsSync(path.join(repositoryRoot, file)))).toBe(
      true,
    );
  });

  it("includes every 2.5D manifest entry and only the native onboarding posters", () => {
    const files = nativePublicMediaAllowlist(repositoryRoot);
    const manifest = JSON.parse(
      readFileSync("public/art/2.5d/manifest.json", "utf8"),
    ) as { staticAssets: string[]; animations: string[] };

    for (const file of [...manifest.staticAssets, ...manifest.animations]) {
      expect(files).toContain(`public/art/2.5d/${file}`);
    }
    expect(files).toContain(
      "public/wallpapers/01-let-there-be-light/poster.webp",
    );
    expect(files).not.toContain(
      "public/wallpapers/01-let-there-be-light/thumbnail.webp",
    );
    expect(files).not.toContain(
      "public/wallpapers/03-abraham-under-the-stars/poster.webp",
    );
  });

  it("omits unreachable social marks and retired game art", () => {
    const files = nativePublicMediaAllowlist(repositoryRoot);

    expect(files).not.toContain("public/brand/apple-logo-white.png");
    expect(files).not.toContain("public/brand/google-g-2025.png");
    expect(files).not.toContain("public/art/scripture-games-coming-1.webp");
    expect(files).not.toContain("public/art/scripture-games-coming-2.webp");
    expect(files).not.toContain("public/art/scripture-games-today.webp");
    expect(files).not.toContain("public/art/seven-days-match-poster.webp");
  });

  it("runs the pruning gate before the native export", () => {
    const builder = readFileSync("scripts/build-native.mjs", "utf8");

    expect(builder.indexOf("pruneNativePublicMedia();")).toBeGreaterThan(
      builder.indexOf("stageTree();"),
    );
    expect(builder.indexOf("pruneServerSurfaces();")).toBeGreaterThan(
      builder.indexOf("pruneNativePublicMedia();"),
    );
  });

  it("runs the exact content-rights verifier for both release profiles", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(scripts.scripts["ios:release:prepare"]).toContain(
      "node scripts/verify-ios-content-rights.mjs",
    );
    expect(scripts.scripts["ios:account-release:prepare"]).toContain(
      "node scripts/verify-ios-content-rights.mjs",
    );
    expect(scripts.scripts["check:ios-content-rights"]).toBe(
      "node scripts/verify-ios-content-rights.mjs",
    );
  });
});
