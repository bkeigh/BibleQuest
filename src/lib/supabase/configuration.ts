import { supabasePublishableKey } from "./config";

/** Reports only whether the public Supabase client configuration is valid. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && supabasePublishableKey(),
  );
}
