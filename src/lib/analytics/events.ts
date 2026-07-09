/**
 * Privacy-first analytics wrapper.
 *
 * HARD RULES (Codex, Volume VII §21):
 *  - Only the whitelisted events below may be tracked.
 *  - No prayer text. No reflection text. No note text. Ever.
 *  - The props type deliberately excludes free-text fields.
 *  - If analytics is not configured, everything is a silent no-op.
 */

export type AnalyticsEvent =
  | "onboarding_started"
  | "onboarding_completed"
  | "quest_viewed"
  | "quest_picked"
  | "quest_unpicked"
  | "quest_started"
  | "quest_completed"
  | "reflection_created"
  | "prayer_created"
  | "prayer_answered"
  | "bible_chapter_opened"
  | "verse_bookmarked"
  | "journey_viewed"
  | "plus_page_viewed"
  | "pwa_install_prompt_viewed";

/** Only small, non-identifying, non-textual properties are allowed. */
type SafeProps = Partial<{
  category: string;
  duration: number;
  source: string;
}>;

const enabled =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";

export function track(event: AnalyticsEvent, props?: SafeProps): void {
  if (!enabled) return;
  try {
    // Wire a privacy-respecting provider (Plausible/PostHog) here.
    // It must be configured to drop IPs and disable autocapture.
    const w = window as unknown as {
      plausible?: (e: string, opts?: { props?: SafeProps }) => void;
    };
    w.plausible?.(event, { props });
  } catch {
    // Analytics must never break the app.
  }
}
