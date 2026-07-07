/** First name for warm greetings; undefined-safe. */
export function firstName(displayName?: string): string | undefined {
  if (!displayName) return undefined;
  const first = displayName.trim().split(/\s+/)[0];
  return first || undefined;
}
