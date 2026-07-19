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
