/** Compile-time event shapes kept for shared guest components. */
export interface AnalyticsEventProps {
  onboarding_started: undefined;
  onboarding_completed: undefined;
  quest_viewed: { category: string };
  quest_picked: undefined;
  quest_unpicked: undefined;
  quest_started: undefined;
  quest_completed: { category: string };
  quest_saved: undefined;
  quest_resumed: undefined;
  quest_removed: undefined;
  quest_step_completed: { step: string };
  quest_card_expanded: { category: string };
  reflection_started: { source: "quest" };
  reflection_created: undefined;
  prayer_created: undefined;
  prayer_answered: undefined;
  bible_chapter_opened: undefined;
  verse_bookmarked: undefined;
  verse_shared: undefined;
  guided_practice_started: { kind: string };
  guided_practice_completed: { kind: string };
  scripture_game_started: { kind: string };
  scripture_game_completed: { kind: string };
  rhythm_saved: undefined;
  streak_milestone: { count: number };
  account_prompt_viewed: { context: string };
  account_prompt_dismissed: { context: string };
  account_prompt_accepted: { context: string };
  sign_in_started: { method: string; source: string };
  sign_in_completed: undefined;
  sign_out: undefined;
  sync_completed: { status: "initial" };
  sync_failed: { status: string };
  pwa_install_prompt_viewed: undefined;
  pwa_install_accepted: undefined;
  pwa_install_dismissed: undefined;
  plus_checkout_opened: { interval: string };
  plus_billing_portal_opened: undefined;
  plus_billing_refreshed: undefined;
  support_checkout_opened: undefined;
}

export type AnalyticsEvent = keyof AnalyticsEventProps;
type TrackArgs<E extends AnalyticsEvent> =
  AnalyticsEventProps[E] extends undefined
    ? [props?: undefined]
    : [props: AnalyticsEventProps[E]];

/** Guest releases persist no analytics choice or queue. */
export const ANALYTICS_CONSENT_KEY = "";

/** Ignores analytics consent because collection is absent from this build. */
export function setAnalyticsConsent(consent: boolean): void {
  void consent;
}

/** Reports the fixed disabled state without installing listeners. */
export function subscribeToAnalyticsConsent(
  listener: (consent: boolean) => void,
): () => void {
  void listener;
  return () => undefined;
}

/** Has no queue to flush. */
export function flushAnalyticsQueue(): Promise<void> {
  return Promise.resolve();
}

/** Records nothing while preserving typed call sites. */
export function track<E extends AnalyticsEvent>(
  event: E,
  ...args: TrackArgs<E>
): void {
  void event;
  void args;
}
