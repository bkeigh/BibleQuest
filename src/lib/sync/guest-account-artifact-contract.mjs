import { GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS } from "./native-account-markers.mjs";

/**
 * These exact values identify executable customer auth, remote account sync,
 * or remote avatar code. Truthful guest UI and legal copy are intentionally
 * not banned: this contract targets machinery, not ordinary English words.
 */
const OPERATIONAL_ACCOUNT_LITERALS = Object.freeze([
  "@supabase/",
  "NEXT_PUBLIC_SUPABASE_",
  "sb_publishable_",
  "sb_secret_",
  "/auth/v1",
  "/rest/v1",
  "/storage/v1",
  "/realtime/v1",
  "/functions/v1",
  "GoTrueClient",
  "PostgrestClient",
  "SupabaseClient",
  "createBrowserClient",
  "signInWithOtp",
  "signInWithPassword",
  "verifyOtp",
  "signInWithOAuth",
  "signUp",
  "exchangeCodeForSession",
  "setSession",
  "getSession",
  "refreshSession",
  "onAuthStateChange",
  "access_token",
  "refresh_token",
  "grant_type=pkce",
  "code_verifier",
  "BIBLEQUEST_WEB_AUTH_",
  "biblequest_web_auth_protocol_v1",
  "biblequest:web-auth",
  "biblequest:web-account-operation",
  "biblequest:web-private",
  "biblequest:web-private-write-generation",
  "biblequest_auth_",
  "biblequest:native-auth-cookies",
  "__biblequestSupabase",
  "WebAuth",
  "webAuth",
  "WEB_AUTH",
  "WebPrivate",
  "webPrivate",
  "WEB_PRIVATE",
  "withWebAuthStorageLock",
  "withWebAccountOperationLock",
  "/auth/customer-callback",
  "/api/auth/",
  "/api/health/signin",
  "/api/profile/avatar",
  "/api/push/",
  "/api/arcade/",
  "/api/billing/",
  "/api/support/checkout",
  "checkout.stripe.com",
  "profile-avatars",
  "createSignedUrl",
  "native_account_beta_availability",
  "account_sync_contract",
  "account_sync_generation",
  "daily_quest_sync_contract",
  "delete_own_account",
  "delete_user_sync_rows",
  "guided_progress_sync_contract",
  "own_account_deletion_status",
  "purge_user_data",
  "replace_user_daily_quests",
  "upsert_mutable_account_rows",
  "biblequest_account_deletion_status_v1",
  "biblequest_account_sync_v4",
  "biblequest_daily_quest_sync_v1",
  "biblequest_guided_progress_sync_v1",
  "biblequest-account-sync-v3",
  "user_settings",
  "notification_preferences",
  "reading_progress",
  "journey_events",
  "growth_events",
  "user_milestones",
  "user_guided_movements",
  "user_daily_quests",
  "biblequest:onboarding-account",
  "biblequest:signin-tracked",
  "biblequest:last-sync-user",
  "biblequest:initial-sync-pending-user",
  "biblequest:local-claim-pending-user",
  "biblequest:account-sync-generation",
  "biblequest:daily-quest-cas",
  "biblequest:mutable-account-cas",
]);

/** Combines the wire registry with the broader reviewed artifact contract. */
export const GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_LITERALS = Object.freeze([
  ...new Set([
    ...GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS,
    ...OPERATIONAL_ACCOUNT_LITERALS,
  ]),
]);

/** Patterns catch new headers and credentials that cannot be listed exactly. */
const GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_PATTERNS = Object.freeze([
  Object.freeze({
    label: "BibleQuest account wire header",
    pattern: /x-biblequest-[a-z0-9][a-z0-9-]*/i,
  }),
  Object.freeze({
    label: "Supabase project origin",
    pattern: /https?:\/\/[a-z0-9]{20}\.supabase\.co/i,
  }),
]);

/** Returns the reviewed rule that an emitted guest artifact violates. */
export function findGuestAccountArtifactViolation(contents) {
  for (const literal of GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_LITERALS) {
    if (contents.includes(literal)) return `literal:${literal}`;
  }
  for (const { label, pattern } of GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_PATTERNS) {
    if (pattern.test(contents)) return `pattern:${label}`;
  }
  return null;
}
