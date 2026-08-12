/**
 * Supabase browser client for authentication and account sync.
 *
 * BibleQuest V1 runs fully in guest mode (local, private-by-default).
 * When the public Supabase URL and publishable key are set,
 * this client enables account sync backed by the schema and RLS policies in
 * supabase/migrations. See docs/SETUP.md for the activation checklist.
 *
 * SECURITY: only the anon (publishable) key may ever appear here. The
 * service-role key is server/admin-only and must never reach the client
 * bundle. See docs/SECURITY.md.
 */
import { createBrowserClient } from "@supabase/ssr";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { supabasePublishableKey } from "./config";
import { isNativeTarget } from "@/lib/platform/target";
import { nativeSupabaseAuthOptions } from "./native-auth-storage";
import { NATIVE_ACCOUNT_ENABLED } from "@/lib/sync/containment";
import {
  EXPECTED_ACCOUNT_USER_HEADER,
  nativeAccountBuildContract,
} from "@/lib/sync/native-beta-headers";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BROWSER_CLIENT_KEY = "__biblequestSupabaseBrowserClient";
let isolatedAuthClientSequence = 0;

type BibleQuestClientGlobal = typeof globalThis & {
  [BROWSER_CLIENT_KEY]?: SupabaseClient;
};

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      supabasePublishableKey(),
  );
}

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see docs/SETUP.md.",
    );
  }
  // Keep one GoTrue owner across route chunks and client navigations.
  const scope = globalThis as BibleQuestClientGlobal;
  scope[BROWSER_CLIENT_KEY] ??= isNativeTarget()
    ? createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabasePublishableKey()!,
        {
          ...nativeSupabaseAuthOptions(),
          global: { headers: nativeAccountHeaders() },
        },
      )
    : createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabasePublishableKey()!,
        { isSingleton: true },
      );
  return scope[BROWSER_CLIENT_KEY];
}

/** Create an auth-only client that can never read or mutate durable auth. */
function createIsolatedAuthClient(purpose: "email-otp" | "account-sign-out") {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see docs/SETUP.md.",
    );
  }
  isolatedAuthClientSequence += 1;
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublishableKey()!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
        storageKey: `biblequest-${purpose}-${isolatedAuthClientSequence}`,
      },
      global: { headers: nativeAccountHeaders() },
    },
  );
}

/** Verify one email code without reading or mutating the durable auth owner. */
export function createEmailOtpVerificationClient() {
  return createIsolatedAuthClient("email-otp");
}

/** Revoke one captured session without letting auth-js clear native storage. */
export function createAccountSignOutClient() {
  return createIsolatedAuthClient("account-sign-out");
}

/** Pause retained native refresh work without reading or deleting Keychain data. */
export async function suspendExistingNativeAuthClient(): Promise<void> {
  if (!isNativeTarget()) return;
  const existing = (globalThis as BibleQuestClientGlobal)[BROWSER_CLIENT_KEY];
  if (!existing) return;
  try {
    await existing.auth.stopAutoRefresh();
  } catch {
    // The live server gate and sync clients remain fail closed independently.
  }
}

/** Resume the already-created native auth owner after availability recovers. */
export async function resumeExistingNativeAuthClient(): Promise<void> {
  if (!isNativeTarget()) return;
  const existing = (globalThis as BibleQuestClientGlobal)[BROWSER_CLIENT_KEY];
  if (!existing) return;
  try {
    await existing.auth.startAutoRefresh();
  } catch {
    // Session verification reports unavailable without discarding Keychain.
  }
}

/** Read a token only while it still belongs to the captured sync identity. */
async function accountAccessToken(expectedUserId: string): Promise<string> {
  const { data, error } = await createClient().auth.getSession();
  const session = data.session;
  if (
    error ||
    !session ||
    session.user.id !== expectedUserId ||
    typeof session.access_token !== "string" ||
    session.access_token.length === 0
  ) {
    throw new Error("The account sync session changed.");
  }
  return session.access_token;
}

/** Mark only native beta requests; ordinary web account clients stay headerless. */
function nativeAccountHeaders(): Record<string, string> {
  const contract = nativeAccountBuildContract();
  return isNativeTarget() && NATIVE_ACCOUNT_ENABLED && contract
    ? { [contract.header]: contract.value }
    : {};
}

/** Create a storage-free authenticated client for sync control RPCs. */
export function createSyncControlClient(expectedUserId: string) {
  if (!UUID.test(expectedUserId)) {
    throw new Error("Invalid account sync boundary.");
  }
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see docs/SETUP.md.",
    );
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublishableKey()!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      accessToken: () => accountAccessToken(expectedUserId),
      global: {
        headers: {
          [EXPECTED_ACCOUNT_USER_HEADER]: expectedUserId,
          ...nativeAccountHeaders(),
        },
      },
    },
  );
}

/** Create a non-singleton data client pinned to one observed sync generation. */
export function createSyncClient(expectedUserId: string, generation: number) {
  if (!UUID.test(expectedUserId) || !Number.isSafeInteger(generation) || generation < 0) {
    throw new Error("Invalid account sync boundary.");
  }
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see docs/SETUP.md.",
    );
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublishableKey()!,
    {
      // Sync generations change after destructive operations, so each data
      // client gets immutable boundary headers and never owns auth storage.
      // This client never owns a session. It reads the exact access token from
      // the singleton and avoids creating a second browser-storage owner.
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      accessToken: () => accountAccessToken(expectedUserId),
      global: {
        headers: {
          [EXPECTED_ACCOUNT_USER_HEADER]: expectedUserId,
          "x-biblequest-sync-generation": String(generation),
          ...nativeAccountHeaders(),
        },
      },
    },
  );
}
