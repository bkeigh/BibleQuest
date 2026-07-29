import { describe, expect, it } from "vitest";
import {
  INSTALL_DISMISS_TTL_MS,
  detectInstallPlatform,
  installDirections,
  installDismissalIsActive,
  isStandaloneWebApp,
} from "@/lib/pwa/install-guidance";

/** Builds the navigator fields used by install-platform detection. */
function browser(userAgent: string, maxTouchPoints = 0) {
  return { userAgent, maxTouchPoints };
}

/** Builds the minimal window shape used by installed-app detection. */
function appWindow(displayModeStandalone: boolean, iosStandalone = false) {
  return {
    matchMedia: () => ({ matches: displayModeStandalone }),
    navigator: { standalone: iosStandalone } as Navigator & {
      standalone?: boolean;
    },
  };
}

describe("PWA install guidance", () => {
  it("recognizes standard and iOS standalone app launches", () => {
    expect(isStandaloneWebApp(appWindow(true))).toBe(true);
    expect(isStandaloneWebApp(appWindow(false, true))).toBe(true);
    expect(isStandaloneWebApp(appWindow(false))).toBe(false);
    expect(isStandaloneWebApp(undefined)).toBe(false);
  });

  it("recognizes iOS browsers and iPadOS desktop-style user agents", () => {
    expect(
      detectInstallPlatform(
        browser(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 CriOS/126 Mobile/15E148 Safari/604.1",
          5,
        ),
      ),
    ).toBe("ios");
    expect(
      detectInstallPlatform(
        browser(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
          5,
        ),
      ),
    ).toBe("ios");
  });

  it("gives browser-specific fallback directions", () => {
    const android = detectInstallPlatform(
      browser("Mozilla/5.0 (Linux; Android 15) Chrome/126 Mobile Safari/537.36"),
    );
    const safari = detectInstallPlatform(
      browser("Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15"),
    );

    expect(installDirections(android)).toContain("browser menu");
    expect(installDirections(safari)).toContain("Add to Dock");
  });

  it("expires dismissals after thirty days and migrates the old boolean flag", () => {
    const now = Date.UTC(2026, 6, 24);

    expect(installDismissalIsActive(String(now - 1_000), now)).toBe(true);
    expect(
      installDismissalIsActive(
        String(now - INSTALL_DISMISS_TTL_MS),
        now,
      ),
    ).toBe(false);
    expect(installDismissalIsActive("1", now)).toBe(false);
  });
});
