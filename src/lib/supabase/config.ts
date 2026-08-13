type PublicSupabaseEnvironment = Record<string, string | undefined>;

const MODERN_PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9._-]{20,}$/;

/** Accepts only the independently rotatable public-key class in its new slot. */
export function isModernSupabasePublishableKey(
  value: string | undefined,
): boolean {
  return MODERN_PUBLISHABLE_KEY.test(value?.trim() ?? "");
}

/** Recognizes only an anonymous legacy JWT, never a service-role credential. */
function legacyAnonymousKey(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  const parts = candidate.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(atob(base64)) as { role?: unknown };
    return payload.role === "anon" ? candidate : null;
  } catch {
    return null;
  }
}

/** Prefers the modern key and fails closed when its variable is mislabeled. */
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
  if (publishableKey?.trim()) {
    return isModernSupabasePublishableKey(publishableKey)
      ? publishableKey.trim()
      : null;
  }
  return legacyAnonymousKey(legacyAnonKey);
}
