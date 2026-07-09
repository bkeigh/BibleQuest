/**
 * RevenueCat — browser client scaffold (Test Store today, Web Billing in prod).
 *
 * Mirrors the Supabase pattern (src/lib/supabase/client.ts): the whole
 * integration NO-OPS until NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY is set, so
 * production stays exactly as it is today (guest mode, Plus "coming soon")
 * until the key is wired. See docs/REVENUECAT.md for the activation checklist.
 *
 * The public key is either the Test Store key (`test_…`, for development —
 * simulated purchases, no Stripe needed) or the Web Billing key (`rcb_…`, for
 * real money). Both are browser-safe PUBLIC keys; no secret key belongs here.
 *
 * NON-NEGOTIABLE (Codex, Volume V §4): nothing here may gate Bible reading,
 * prayer, reflection, basic quests, or the journey. Plus is depth; Patron is
 * support — see subscription-engine.ts.
 */
import type { Purchases } from "@revenuecat/purchases-js";

/** RevenueCat public SDK key (browser-safe). Unset in guest mode. */
const PUBLIC_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY;

/**
 * The entitlement that unlocks Plus. Matches the RevenueCat entitlement
 * identifier ("BibleQuest Plus"); override via env if the dashboard renames it.
 */
export const PLUS_ENTITLEMENT_ID =
  process.env.NEXT_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT ?? "BibleQuest Plus";

export function isRevenueCatConfigured(): boolean {
  return Boolean(PUBLIC_API_KEY);
}

/** Persisted so a guest keeps the same RevenueCat identity across reloads. */
const ANON_ID_KEY = "biblequest:rc-anon-id";

/**
 * A stable app user id for RevenueCat. Prefer the signed-in Supabase user id
 * (durable across devices); otherwise reuse a RevenueCat anonymous id kept in
 * localStorage so a guest's membership survives a reload on this device.
 */
function resolveAppUserId(
  sdk: typeof Purchases,
  supabaseUserId: string | null,
): string {
  if (supabaseUserId) return supabaseUserId;
  if (typeof window === "undefined") {
    // Unreachable — configure() only runs client-side — but keeps this pure.
    return sdk.generateRevenueCatAnonymousAppUserId();
  }
  let id = window.localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = sdk.generateRevenueCatAnonymousAppUserId();
    window.localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

let instance: Purchases | null = null;
let configuredFor: string | null = null;

/**
 * Lazily import + configure the SDK exactly once. Returns null when RevenueCat
 * isn't configured or when called on the server. The dynamic import keeps the
 * browser-only SDK out of the server bundle. If the app user id changes (e.g. a
 * guest signs in), the SDK is moved to the new identity via changeUser.
 */
export async function getPurchases(
  supabaseUserId: string | null,
): Promise<Purchases | null> {
  if (!PUBLIC_API_KEY || typeof window === "undefined") return null;

  const { Purchases: sdk } = await import("@revenuecat/purchases-js");
  const appUserId = resolveAppUserId(sdk, supabaseUserId);

  if (!instance) {
    try {
      instance = sdk.configure({ apiKey: PUBLIC_API_KEY, appUserId });
    } catch {
      // Already configured (e.g. after a dev hot-reload) — reuse the singleton.
      instance = sdk.getSharedInstance();
    }
    configuredFor = appUserId;
    return instance;
  }

  if (configuredFor !== appUserId) {
    await instance.changeUser(appUserId);
    configuredFor = appUserId;
  }
  return instance;
}
