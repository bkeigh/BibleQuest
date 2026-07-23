/**
 * Supabase browser client for authentication and account sync.
 *
 * BibleQuest V1 runs fully in guest mode (local, private-by-default).
 * When NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set,
 * this client enables account sync backed by the schema and RLS policies in
 * supabase/migrations. See docs/SETUP.md for the activation checklist.
 *
 * SECURITY: only the anon (publishable) key may ever appear here. The
 * service-role key is server/admin-only and must never reach the client
 * bundle. See docs/SECURITY.md.
 */
import { createBrowserClient } from "@supabase/ssr";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY — see docs/SETUP.md."
    );
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Create a non-singleton data client pinned to one observed sync generation. */
export function createSyncClient(expectedUserId: string, generation: number) {
  if (!UUID.test(expectedUserId) || !Number.isSafeInteger(generation) || generation < 0) {
    throw new Error("Invalid account sync boundary.");
  }
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY — see docs/SETUP.md.",
    );
  }
  const authClient = createClient();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Sync generations change after destructive operations, so a shared
      // singleton could silently retain stale global headers. Reuse the auth
      // singleton only as the token source so data clients do not create
      // competing GoTrue instances under the same browser storage key.
      isSingleton: false,
      accessToken: async () => {
        const { data, error } = await authClient.auth.getSession();
        if (error) throw error;
        return data.session?.access_token ?? null;
      },
      global: {
        headers: {
          "x-biblequest-expected-user": expectedUserId,
          "x-biblequest-sync-generation": String(generation),
        },
      },
    },
  );
}
