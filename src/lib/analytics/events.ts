/**
 * Privacy-first analytics wrapper.
 *
 * HARD RULES (Codex, Volume VII §21):
 *  - Only the whitelisted events below may be tracked.
 *  - No prayer text. No reflection text. No note text. Ever.
 *  - The props type deliberately excludes free-text fields.
 *  - If analytics is not configured, everything is a silent no-op.
 *  - The user can turn analytics off at any time (Settings → Privacy);
 *    consent is re-checked on every event, never cached at module load.
 *
 * Transport: the Plausible Events API (cookieless, no fingerprinting, no
 * cross-site tracking; IPs are used transiently for uniqueness and never
 * stored). Active only when NEXT_PUBLIC_ANALYTICS_ENABLED === "true" AND
 * NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set. A `window.plausible` script, if one
 * is ever added, is used as a secondary dispatch path.
 *
 * Offline: events queue in localStorage (capped) and flush when the
 * connection returns — see flushAnalyticsQueue(), called by AppShell on
 * mount and on the window "online" event. Queued events are recorded at
 * flush time; for trend-level product learning that skew is acceptable.
 */

export type AnalyticsEvent =
  // onboarding
  | "onboarding_started"
  | "onboarding_completed"
  // quest lifecycle
  | "quest_viewed"
  | "quest_picked"
  | "quest_unpicked"
  | "quest_started"
  | "quest_completed"
  | "quest_saved"
  | "quest_paused"
  | "quest_resumed"
  | "quest_archived"
  | "quest_removed"
  | "quest_reopened"
  | "quest_step_completed"
  | "quest_card_expanded"
  | "suggestion_selected"
  // reflection & prayer (counts only — never content)
  | "reflection_started"
  | "reflection_created"
  | "prayer_created"
  | "prayer_answered"
  // scripture
  | "bible_chapter_opened"
  | "verse_bookmarked"
  // journey & habit
  | "journey_viewed"
  | "streak_milestone"
  // account funnel
  | "account_prompt_viewed"
  | "account_prompt_dismissed"
  | "account_prompt_accepted"
  | "sign_in_started"
  | "sign_in_completed"
  | "sign_out"
  // sync outcomes
  | "sync_completed"
  | "sync_failed"
  // shell
  | "plus_page_viewed"
  | "pwa_install_prompt_viewed"
  | "pwa_install_accepted"
  | "pwa_install_dismissed";

/**
 * Only small, non-identifying, non-textual properties are allowed.
 * Deliberately no free-text fields, no ids, no emails, no verse text.
 */
type SafeProps = Partial<{
  /** Quest category or similar enum-like label. */
  category: string;
  duration: number;
  /** Where the action came from: "home" | "browse" | "detail" | "feed" | "onboarding". */
  source: string;
  /** Quest step key: "scripture" | "live" | "reflect" | "pray". */
  step: string;
  /** Auth method: "magic_link" | "phone_otp" | "google". */
  method: string;
  /** Account-prompt context key. */
  context: string;
  /** Small counters (streak day, feed size). Never identifiers. */
  count: number;
  /** Lifecycle status labels ("initial" | "push" for sync, etc.). */
  status: string;
}>;

const QUEUE_KEY = "biblequest:analytics-queue";
const CONSENT_KEY = "biblequest:analytics-consent";
const QUEUE_CAP = 50;

const envEnabled =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";
const plausibleDomain =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
    : undefined;
const plausibleHost =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_PLAUSIBLE_HOST) ||
  "https://plausible.io";

/**
 * Runtime consent, mirrored to its own localStorage key by
 * setAnalyticsConsent (called from the settings store wiring) so events
 * fired before the store hydrates still honor the last known choice.
 * Default is consent — the data is anonymous and content-free — and the
 * Settings → Privacy toggle turns it off in one tap.
 */
export function setAnalyticsConsent(consent: boolean): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, consent ? "1" : "0");
  } catch {
    // Private mode etc. — consent falls back to the default below.
  }
}

function hasConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) !== "0";
  } catch {
    return true;
  }
}

function analyticsActive(): boolean {
  if (typeof window === "undefined") return false;
  if (!envEnabled) return false;
  // Respect the browser-level signals too.
  if (navigator.doNotTrack === "1") return false;
  return hasConsent();
}

interface QueuedEvent {
  name: string;
  url: string;
  props?: SafeProps;
}

function readQueue(): QueuedEvent[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]): void {
  try {
    window.localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(queue.slice(-QUEUE_CAP))
    );
  } catch {
    // Queue is best-effort; analytics must never break the app.
  }
}

/** Current page with query/hash stripped — never leak params. */
function safeUrl(): string {
  return window.location.origin + window.location.pathname;
}

async function send(event: QueuedEvent): Promise<boolean> {
  if (!plausibleDomain) return true; // nowhere to send — swallow silently
  try {
    const res = await fetch(`${plausibleHost}/api/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        domain: plausibleDomain,
        name: event.name,
        url: event.url,
        props: event.props,
      }),
    });
    return res.ok || res.status === 400; // malformed events don't retry
  } catch {
    return false;
  }
}

/**
 * Retry anything the network dropped. Safe to call anytime; re-entrant
 * calls no-op. Each event leaves the persisted queue only AFTER its send
 * succeeds, so a page unload mid-flush never loses events (at worst one
 * event double-sends — trend-level analytics prefers that to silent loss).
 * Consent is re-checked per event so an opt-out mid-flush stops the rest.
 */
let flushing = false;

export function flushAnalyticsQueue(): void {
  if (flushing || !analyticsActive() || !plausibleDomain) return;
  if (!readQueue().length) return;
  flushing = true;
  void (async () => {
    try {
      for (;;) {
        if (!analyticsActive()) return;
        const queue = readQueue();
        const head = queue[0];
        if (!head) return;
        if (!(await send(head))) return; // still offline — keep the rest
        writeQueue(queue.slice(1));
      }
    } finally {
      flushing = false;
    }
  })();
}

export function track(event: AnalyticsEvent, props?: SafeProps): void {
  try {
    if (typeof window === "undefined") return;
    if (!analyticsActive()) {
      // Dev echo so the funnel is verifiable without a provider.
      if (process.env.NODE_ENV === "development") {
        console.debug("[analytics:off]", event, props ?? "");
      }
      return;
    }

    // Secondary path for a page-level provider script, if ever present.
    const w = window as unknown as {
      plausible?: (e: string, opts?: { props?: SafeProps }) => void;
    };
    w.plausible?.(event, { props });

    if (!plausibleDomain) return;
    const payload: QueuedEvent = { name: event, url: safeUrl(), props };
    void send(payload).then((ok) => {
      if (!ok) writeQueue([...readQueue(), payload]);
    });
  } catch {
    // Analytics must never break the app.
  }
}
