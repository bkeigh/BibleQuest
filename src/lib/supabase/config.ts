type PublicSupabaseEnvironment = Record<string, string | undefined>;

/** Prefers Supabase's independently rotatable publishable key over the legacy anon key. */
export function supabasePublishableKey(
  env: PublicSupabaseEnvironment = process.env,
): string | null {
  return (
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    null
  );
}
