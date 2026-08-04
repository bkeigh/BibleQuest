type PublicSupabaseEnvironment = Record<string, string | undefined>;

/** Prefers Supabase's independently rotatable publishable key over the legacy anon key. */
export function supabasePublishableKey(
  env?: PublicSupabaseEnvironment,
): string | null {
  // Keep production client reads static so Next.js can inline both public keys.
  const publishableKey = env
    ? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const legacyAnonKey = env
    ? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    publishableKey?.trim() ||
    legacyAnonKey?.trim() ||
    null
  );
}
