/** Browser families whose install steps differ in user-facing wording. */
export type InstallPlatform =
  | "ios"
  | "android"
  | "safari-desktop"
  | "chromium-desktop"
  | "other";

export const INSTALL_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

interface StandaloneWindowLike {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: Navigator & { standalone?: boolean };
}

/** Recognizes installed PWAs across standard display mode and iOS Home Screen. */
export function isStandaloneWebApp(
  windowLike: StandaloneWindowLike | undefined =
    typeof window === "undefined"
      ? undefined
      : (window as unknown as StandaloneWindowLike),
): boolean {
  if (!windowLike) return false;
  return (
    windowLike.matchMedia?.("(display-mode: standalone)").matches === true ||
    Boolean(windowLike.navigator?.standalone)
  );
}

/** Detects the smallest useful platform family without relying on UA brands. */
export function detectInstallPlatform(
  navigatorLike: Pick<Navigator, "userAgent" | "maxTouchPoints">,
): InstallPlatform {
  const userAgent = navigatorLike.userAgent;
  const iPadOS =
    /Macintosh/i.test(userAgent) && navigatorLike.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(userAgent) || iPadOS) return "ios";
  if (/android/i.test(userAgent)) return "android";

  const safari =
    /safari/i.test(userAgent) &&
    !/chrome|crios|chromium|edg|fxios|firefox|opr|opera/i.test(userAgent);
  if (safari) return "safari-desktop";
  if (/chrome|chromium|edg/i.test(userAgent)) return "chromium-desktop";
  return "other";
}

/** Gives a useful manual path when the native install event is unavailable. */
export function installDirections(platform: InstallPlatform): string {
  switch (platform) {
    case "ios":
      return "Tap Share (the square with an up arrow), then Add to Home Screen.";
    case "android":
      return "Open your browser menu (⋮), then tap Install app or Add to Home screen.";
    case "safari-desktop":
      return "Open Safari’s File menu, then choose Add to Dock.";
    case "chromium-desktop":
      return "Click the install icon in the address bar, or open the browser menu and choose Install BibleQuest.";
    default:
      return "Open your browser menu and choose Install app or Add to Home screen.";
  }
}

/** Treats dismissal as a cooldown so users can see improved guidance later. */
export function installDismissalIsActive(
  storedValue: string | null,
  now = Date.now(),
): boolean {
  if (!storedValue) return false;
  const dismissedAt = Number(storedValue);
  return (
    Number.isFinite(dismissedAt) &&
    dismissedAt <= now &&
    now - dismissedAt < INSTALL_DISMISS_TTL_MS
  );
}
