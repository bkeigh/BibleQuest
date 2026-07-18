/** Safe post-login home route used when `next` is missing or untrusted. */
export const DEFAULT_NEXT = "/app";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const INVALID_PERCENT_ESCAPE = /%(?![0-9a-f]{2})/i;

/**
 * Derive a same-origin path from an untrusted auth callback target.
 *
 * Only a plain internal path is accepted. Validation also examines the
 * decoded form so encoded backslashes, control characters, or a disguised
 * protocol-relative prefix cannot acquire special meaning in a later parser.
 */
export function safeNextPath(next: string | null): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    CONTROL_CHARACTERS.test(next) ||
    INVALID_PERCENT_ESCAPE.test(next)
  ) {
    return DEFAULT_NEXT;
  }

  try {
    const decoded = decodeURIComponent(next);
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      CONTROL_CHARACTERS.test(decoded)
    ) {
      return DEFAULT_NEXT;
    }

    const base = new URL("https://biblequest.invalid");
    const resolved = new URL(next, base);
    return resolved.origin === base.origin ? next : DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
}

/**
 * Build the same-origin callback path used by browser auth methods. Keeping
 * the target in a validated query parameter lets onboarding return to its
 * account-restoration boundary, while the final account invitation can keep
 * a previously chosen in-app destination.
 */
export function authCallbackPath(next: string | null): string {
  const params = new URLSearchParams({ next: safeNextPath(next) });
  return `/auth/callback?${params.toString()}`;
}
