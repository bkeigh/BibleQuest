/**
 * Privacy-first analytics with one transport: Plausible's Events API.
 *
 * Collection is deny-by-default. It requires a valid build-time configuration,
 * an explicit persisted opt-in, and no browser privacy signal. Every event and
 * property is checked against the runtime schema below before it can be sent or
 * persisted. Analytics failures are always silent and never affect the app.
 */

type QuestCategory =
  | "prayer"
  | "scripture"
  | "service"
  | "kindness"
  | "forgiveness"
  | "generosity"
  | "discipline"
  | "gratitude"
  | "silence"
  | "worship"
  | "family"
  | "community"
  | "reflection"
  | "patience";

type QuestStep = "scripture" | "live" | "reflect" | "pray";
type AccountContext =
  | "onboarding"
  | "first_quest_completed"
  | "first_reflection"
  | "milestone_reached";
type SignInMethod = "magic_link" | "google";
type SignInSource = "account" | "onboarding";
type SyncStatus = "initial" | "push";
type BillingInterval = "monthly" | "annual";

/** Compile-time event/property allowlist. No arbitrary strings are accepted. */
export interface AnalyticsEventProps {
  onboarding_started: undefined;
  onboarding_completed: undefined;
  quest_viewed: { category: QuestCategory };
  quest_picked: undefined;
  quest_unpicked: undefined;
  quest_started: undefined;
  quest_completed: { category: QuestCategory };
  quest_saved: undefined;
  quest_paused: undefined;
  quest_resumed: undefined;
  quest_archived: undefined;
  quest_removed: undefined;
  quest_reopened: undefined;
  quest_step_completed: { step: QuestStep };
  quest_card_expanded: { category: QuestCategory };
  reflection_started: { source: "quest" };
  reflection_created: undefined;
  prayer_created: undefined;
  prayer_answered: undefined;
  bible_chapter_opened: undefined;
  verse_bookmarked: undefined;
  verse_shared: undefined;
  streak_milestone: { count: number };
  account_prompt_viewed: { context: AccountContext };
  account_prompt_dismissed: { context: AccountContext };
  account_prompt_accepted: { context: AccountContext };
  sign_in_started: { method: SignInMethod; source: SignInSource };
  sign_in_completed: undefined;
  sign_out: undefined;
  sync_completed: { status: "initial" };
  sync_failed: { status: SyncStatus };
  pwa_install_prompt_viewed: undefined;
  pwa_install_accepted: undefined;
  pwa_install_dismissed: undefined;
  plus_checkout_opened: { interval: BillingInterval };
  plus_billing_portal_opened: undefined;
  plus_billing_refreshed: undefined;
}

export type AnalyticsEvent = keyof AnalyticsEventProps;
type TrackArgs<E extends AnalyticsEvent> =
  AnalyticsEventProps[E] extends undefined
    ? [props?: undefined]
    : [props: AnalyticsEventProps[E]];
type SafeProps = Record<string, string | number>;

type EnumRule = { kind: "enum"; values: readonly string[] };
type NumberRule = { kind: "number"; min: number; max: number };
type PropRule = EnumRule | NumberRule;
type EventRule = { props: Readonly<Record<string, PropRule>> };

const CATEGORIES: readonly QuestCategory[] = [
  "prayer",
  "scripture",
  "service",
  "kindness",
  "forgiveness",
  "generosity",
  "discipline",
  "gratitude",
  "silence",
  "worship",
  "family",
  "community",
  "reflection",
  "patience",
];
const STEPS: readonly QuestStep[] = ["scripture", "live", "reflect", "pray"];
const ACCOUNT_CONTEXTS: readonly AccountContext[] = [
  "onboarding",
  "first_quest_completed",
  "first_reflection",
  "milestone_reached",
];

const noProps = { props: {} } as const;
const categoryProps = {
  props: { category: { kind: "enum", values: CATEGORIES } },
} as const;
const contextProps = {
  props: { context: { kind: "enum", values: ACCOUNT_CONTEXTS } },
} as const;

/** Runtime allowlist. Unexpected events, keys, and values reject the event. */
const EVENT_RULES = {
  onboarding_started: noProps,
  onboarding_completed: noProps,
  quest_viewed: categoryProps,
  quest_picked: noProps,
  quest_unpicked: noProps,
  quest_started: noProps,
  quest_completed: categoryProps,
  quest_saved: noProps,
  quest_paused: noProps,
  quest_resumed: noProps,
  quest_archived: noProps,
  quest_removed: noProps,
  quest_reopened: noProps,
  quest_step_completed: {
    props: { step: { kind: "enum", values: STEPS } },
  },
  quest_card_expanded: categoryProps,
  reflection_started: {
    props: { source: { kind: "enum", values: ["quest"] } },
  },
  reflection_created: noProps,
  prayer_created: noProps,
  prayer_answered: noProps,
  bible_chapter_opened: noProps,
  verse_bookmarked: noProps,
  verse_shared: noProps,
  streak_milestone: {
    props: { count: { kind: "number", min: 1, max: 365 } },
  },
  account_prompt_viewed: contextProps,
  account_prompt_dismissed: contextProps,
  account_prompt_accepted: contextProps,
  sign_in_started: {
    props: {
      method: {
        kind: "enum",
        values: ["magic_link", "google"],
      },
      source: { kind: "enum", values: ["account", "onboarding"] },
    },
  },
  sign_in_completed: noProps,
  sign_out: noProps,
  sync_completed: {
    props: { status: { kind: "enum", values: ["initial"] } },
  },
  sync_failed: {
    props: { status: { kind: "enum", values: ["initial", "push"] } },
  },
  pwa_install_prompt_viewed: noProps,
  pwa_install_accepted: noProps,
  pwa_install_dismissed: noProps,
  plus_checkout_opened: {
    props: {
      interval: { kind: "enum", values: ["monthly", "annual"] },
    },
  },
  plus_billing_portal_opened: noProps,
  plus_billing_refreshed: noProps,
} as const satisfies Record<AnalyticsEvent, EventRule>;

const QUEUE_KEY = "biblequest:analytics-queue";
export const ANALYTICS_CONSENT_KEY = "biblequest:analytics-consent";
const QUEUE_CAP = 50;
const MAX_ENUM_LENGTH = 40;

interface AnalyticsConfig {
  domain: string;
  endpoint: string;
}

function validDomain(value: string | undefined): string | null {
  if (!value || value !== value.trim() || value.length > 253) return null;
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value)) return null;
  if (value.includes("..")) return null;
  return value.toLowerCase();
}

function validHost(value: string | undefined): string | null {
  const raw = value || "https://plausible.io";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function readConfig(): AnalyticsConfig | null {
  if (
    typeof process === "undefined" ||
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true"
  ) {
    return null;
  }
  const domain = validDomain(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN);
  const host = validHost(process.env.NEXT_PUBLIC_PLAUSIBLE_HOST);
  if (!domain || !host) return null;
  return { domain, endpoint: `${host}/api/event` };
}

const analyticsConfig = readConfig();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(EVENT_RULES, value)
  );
}

type PropsResult =
  | { ok: true; props?: SafeProps }
  | { ok: false };

function sanitizeProps(event: AnalyticsEvent, candidate: unknown): PropsResult {
  const rules = EVENT_RULES[event].props as Readonly<Record<string, PropRule>>;
  const expectedKeys = Object.keys(rules);

  if (!expectedKeys.length) {
    if (candidate == null) return { ok: true };
    return isObject(candidate) && Object.keys(candidate).length === 0
      ? { ok: true }
      : { ok: false };
  }
  if (!isObject(candidate)) return { ok: false };

  const actualKeys = Object.keys(candidate);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => !Object.prototype.hasOwnProperty.call(rules, key))
  ) {
    return { ok: false };
  }

  const props: SafeProps = {};
  for (const key of expectedKeys) {
    const value = candidate[key];
    const rule = rules[key];
    if (rule.kind === "enum") {
      if (
        typeof value !== "string" ||
        value.length > MAX_ENUM_LENGTH ||
        !rule.values.includes(value)
      ) {
        return { ok: false };
      }
      props[key] = value;
      continue;
    }
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < rule.min ||
      value > rule.max
    ) {
      return { ok: false };
    }
    props[key] = value;
  }
  return { ok: true, props };
}

const SAFE_STATIC_PATHS = new Set([
  "/",
  "/about",
  "/churches",
  "/offline",
  "/onboarding",
  "/pricing",
  "/privacy",
  "/terms",
  "/writing",
  "/app",
  "/app/account",
  "/app/bible",
  "/app/bible/saved",
  "/app/journey",
  "/app/plus",
  "/app/prayer",
  "/app/prayer/new",
  "/app/prayer/reflections",
  "/app/prayer/reflection/new",
  "/app/quests",
  "/app/reflection",
  "/app/reflection/new",
  "/app/settings",
]);

/** Replaces every dynamic route segment so record IDs and slugs cannot leak. */
function safePathname(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (SAFE_STATIC_PATHS.has(path)) return path;
  if (/^\/app\/quests\/[^/]+$/.test(path)) return "/app/quests/[quest]";
  if (/^\/app\/bible\/[^/]+\/[^/]+$/.test(path)) {
    return "/app/bible/[book]/[chapter]";
  }
  if (/^\/app\/bible\/[^/]+$/.test(path)) return "/app/bible/[book]";
  return "/";
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof window === "undefined" || typeof value !== "string") return null;
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.origin !== window.location.origin) return null;
    return `${url.origin}${safePathname(url.pathname)}`;
  } catch {
    return null;
  }
}

function currentSafeUrl(): string | null {
  if (typeof window === "undefined") return null;
  return sanitizeUrl(window.location.href);
}

interface QueuedEvent {
  name: AnalyticsEvent;
  url: string;
  props?: SafeProps;
}

function sanitizeQueuedEvent(value: unknown): QueuedEvent | null {
  if (!isObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !["name", "url", "props"].includes(key))) return null;
  if (!isAnalyticsEvent(value.name)) return null;
  const url = sanitizeUrl(value.url);
  const props = sanitizeProps(value.name, value.props);
  if (!url || !props.ok) return null;
  return {
    name: value.name,
    url,
    ...(props.props ? { props: props.props } : {}),
  };
}

function persistQueue(queue: QueuedEvent[]): void {
  try {
    const safe = queue
      .map(sanitizeQueuedEvent)
      .filter((event): event is QueuedEvent => event !== null)
      .slice(-QUEUE_CAP);
    if (safe.length) {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(safe));
    } else {
      window.localStorage.removeItem(QUEUE_KEY);
    }
  } catch {
    // Best effort only. A blocked/full storage area disables offline retry.
  }
}

function readQueue(): QueuedEvent[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      persistQueue([]);
      return [];
    }
    const safe = parsed
      .map(sanitizeQueuedEvent)
      .filter((event): event is QueuedEvent => event !== null)
      .slice(-QUEUE_CAP);
    if (JSON.stringify(safe) !== raw) persistQueue(safe);
    return safe;
  } catch {
    persistQueue([]);
    return [];
  }
}

function clearQueue(): void {
  try {
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    // The in-memory opt-out below still prevents sends in this tab.
  }
}

const inFlight = new Set<AbortController>();
const consentSubscribers = new Set<(consent: boolean) => void>();
let storageListenerReady = false;
let forcedOff = false;

function abortInFlight(): void {
  for (const controller of inFlight) controller.abort();
  inFlight.clear();
}

function applyConsentChange(consent: boolean): void {
  forcedOff = !consent;
  if (!consent) {
    clearQueue();
    abortInFlight();
  }
  for (const subscriber of consentSubscribers) {
    try {
      subscriber(consent);
    } catch {
      // A UI synchronization callback can never affect privacy enforcement.
    }
  }
}

function ensureStorageListener(): void {
  if (
    storageListenerReady ||
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function"
  ) {
    return;
  }
  window.addEventListener("storage", (event) => {
    if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) {
      applyConsentChange(event.newValue === "1");
    }
  });
  storageListenerReady = true;
}

/** Mirrors the Settings toggle and makes opt-out immediate in this tab. */
export function setAnalyticsConsent(consent: boolean): void {
  if (typeof window === "undefined") return;
  ensureStorageListener();
  if (!consent) forcedOff = true;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent ? "1" : "0");
    applyConsentChange(consent);
  } catch {
    // An opt-in that cannot be persisted is ambiguous, so it remains off.
    applyConsentChange(false);
  }
}

/** Keeps the Settings UI aligned when consent changes in another tab. */
export function subscribeToAnalyticsConsent(
  subscriber: (consent: boolean) => void
): () => void {
  ensureStorageListener();
  consentSubscribers.add(subscriber);
  return () => consentSubscribers.delete(subscriber);
}

function hasExplicitConsent(): boolean {
  if (forcedOff || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function browserPrivacySignalEnabled(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & {
    msDoNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const win = window as Window & { doNotTrack?: string };
  return (
    nav.doNotTrack === "1" ||
    nav.msDoNotTrack === "1" ||
    win.doNotTrack === "1" ||
    nav.globalPrivacyControl === true
  );
}

function analyticsActive(): boolean {
  if (typeof window === "undefined" || !analyticsConfig) return false;
  ensureStorageListener();
  return hasExplicitConsent() && !browserPrivacySignalEnabled();
}

type SendResult = "sent" | "drop" | "retry" | "cancelled";

async function send(event: QueuedEvent): Promise<SendResult> {
  if (!analyticsConfig || !analyticsActive()) return "cancelled";
  const controller = new AbortController();
  inFlight.add(controller);
  try {
    const response = await fetch(analyticsConfig.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: analyticsConfig.domain,
        name: event.name,
        url: event.url,
        ...(event.props ? { props: event.props } : {}),
      }),
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!analyticsActive() || controller.signal.aborted) return "cancelled";
    if (response.ok) return "sent";
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429
    ) {
      return "drop";
    }
    return "retry";
  } catch {
    return controller.signal.aborted ? "cancelled" : "retry";
  } finally {
    inFlight.delete(controller);
  }
}

let flushPromise: Promise<void> | null = null;

/** Flushes one sanitized queued event at a time, re-checking consent each time. */
export function flushAnalyticsQueue(): Promise<void> {
  if (flushPromise) return flushPromise;
  if (!analyticsActive() || !readQueue().length) return Promise.resolve();

  flushPromise = (async () => {
    for (;;) {
      if (!analyticsActive()) return;
      const queue = readQueue();
      const head = queue[0];
      if (!head) return;
      const result = await send(head);
      if (result === "retry" || result === "cancelled") return;
      if (!analyticsActive()) return;
      persistQueue(queue.slice(1));
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

/**
 * Accepts an event only after configuration, consent, DNT/GPC, event name,
 * property keys, property values, and the normalized current URL all pass.
 */
export function track<E extends AnalyticsEvent>(
  event: E,
  ...args: TrackArgs<E>
): void {
  try {
    if (!analyticsActive() || !isAnalyticsEvent(event)) return;
    const props = sanitizeProps(event, args[0]);
    const url = currentSafeUrl();
    if (!props.ok || !url) return;
    const payload: QueuedEvent = {
      name: event,
      url,
      ...(props.props ? { props: props.props } : {}),
    };
    void send(payload).then((result) => {
      if (result === "retry" && analyticsActive()) {
        persistQueue([...readQueue(), payload]);
      }
    });
  } catch {
    // Analytics must never break the app.
  }
}
