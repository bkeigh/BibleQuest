/**
 * Supabase server client — scaffold for server components and route handlers.
 * Uses the anon key with the user's cookie session; RLS enforces ownership.
 * See docs/SETUP.md and supabase/policies.sql.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "./client";

export { isSupabaseConfigured };

export async function createServerSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY — see docs/SETUP.md."
    );
  }
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
