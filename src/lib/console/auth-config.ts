import "server-only";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Requires an exact rollout value so the private console fails closed. */
export function consoleAuthEnabled(
  raw = process.env.BIBLEQUEST_CONSOLE_AUTH_ENABLED,
): boolean {
  return raw === "true";
}

/** Parses the operator allowlist without exposing it to browser components. */
export function consoleAllowedEmails(
  raw = process.env.BIBLEQUEST_CONSOLE_ALLOWED_EMAILS,
): Set<string> {
  if (!raw) return new Set();

  const emails = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length <= 254 && EMAIL.test(email));

  return new Set(emails.slice(0, 20));
}
