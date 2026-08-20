type PublicSupabaseEnvironment = Record<string, string | undefined>;

/** Rejects every key class in the guest export. */
export function isModernSupabasePublishableKey(
  _value: string | undefined,
): boolean {
  void _value;
  return false;
}

/** Keeps the staged guest client unconfigured for every input. */
export function supabasePublishableKey(
  _env?: PublicSupabaseEnvironment,
): string | null {
  void _env;
  return null;
}
