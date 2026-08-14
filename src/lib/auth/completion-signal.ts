/**
 * A short-lived, bounded callback signal. It contains no account id, email,
 * provider response, or token; it only tells the client that the session being
 * restored came from a callback that completed successfully.
 */
export const AUTH_COMPLETION_COOKIE = "biblequest_auth_completed";

/** Records one content-free browser completion for the next mounted session. */
export function markAuthCompletionSignal(): void {
  if (typeof document === "undefined") return;
  const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
  try {
    document.cookie =
      `${AUTH_COMPLETION_COOKIE}=1; Path=/; Max-Age=300; SameSite=Lax` +
      secure;
  } catch {
    // Analytics deduplication may degrade, but the verified session stays valid.
  }
}

export function consumeAuthCompletionSignal(): boolean {
  if (typeof document === "undefined") return false;
  const found = document.cookie
    .split(";")
    .some((part) => part.trim() === `${AUTH_COMPLETION_COOKIE}=1`);
  if (found) {
    document.cookie = `${AUTH_COMPLETION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  return found;
}

export function authEventCompletesSignIn(
  event: string,
  hasCallbackSignal: boolean,
): boolean {
  return event === "SIGNED_IN" ||
    (event === "INITIAL_SESSION" && hasCallbackSignal);
}
