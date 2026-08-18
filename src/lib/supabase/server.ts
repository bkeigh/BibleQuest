/**
 * Legacy Supabase server-cookie client reserved for the operator console.
 * Customer account requests use explicit bearer clients and must never import
 * this factory. See docs/SETUP.md and supabase/migrations.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "./configuration";
import { supabasePublishableKey } from "./config";

export { isSupabaseConfigured };

export async function createServerSupabase(
  boundaryHeaders: Record<string, string> = {},
) {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see docs/SETUP.md.",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublishableKey()!,
    {
      global: { headers: boundaryHeaders },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — the request proxy handles refresh.
          }
        },
      },
    }
  );
}
