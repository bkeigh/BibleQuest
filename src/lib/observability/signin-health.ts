/**
 * Decides whether sign-in looks broken, from the account list alone.
 *
 * Free of clock, network and environment so the thresholds can be tested
 * directly. The route supplies the real inputs.
 *
 * The signal is a person who created an account and never signed in. Supabase
 * omits `last_sign_in_at` until a first success, so its absence is a fact
 * rather than an inference.
 */

export const DEFAULT_FRESH_HOURS = 48;

export interface SigninHealthAccount {
  created_at?: string | null;
  last_sign_in_at?: string | null;
}

export interface SigninHealthReport {
  totalUsers: number;
  neverSignedIn: number;
  newlyStuck: number;
  backlogStuck: number;
  oldestStuckHours: number;
  signedInLastDay: number;
  problems: string[];
  ok: boolean;
}

/**
 * Splits never-signed-in accounts into the ones worth waking someone for and
 * the historical backlog.
 *
 * Only the fresh ones raise a problem. Several accounts have been stuck since
 * before this check existed, and an alert that fires every run for a known
 * number is one people learn to ignore — which is how the original failures
 * went unnoticed for days.
 */
export function assessSigninHealth(
  accounts: SigninHealthAccount[],
  now: Date,
  options: { freshHours?: number } = {},
): SigninHealthReport {
  const freshHours = options.freshHours ?? DEFAULT_FRESH_HOURS;
  if (!Array.isArray(accounts)) {
    throw new TypeError("accounts must be an array");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("now must be a valid Date");
  }
  if (!Number.isFinite(freshHours) || freshHours <= 0) {
    throw new RangeError("freshHours must be a positive number");
  }

  const freshMs = freshHours * 3_600_000;
  const dayMs = 86_400_000;
  let neverSignedIn = 0;
  let newlyStuck = 0;
  let signedInLastDay = 0;
  let oldestStuckHours = 0;

  for (const account of accounts) {
    const createdAt = Date.parse(account?.created_at ?? "");
    const lastSignIn = account?.last_sign_in_at
      ? Date.parse(account.last_sign_in_at)
      : null;

    if (lastSignIn !== null && !Number.isNaN(lastSignIn)) {
      if (now.getTime() - lastSignIn <= dayMs) signedInLastDay += 1;
      continue;
    }

    neverSignedIn += 1;
    if (Number.isNaN(createdAt)) continue;
    const ageMs = now.getTime() - createdAt;
    if (ageMs <= freshMs) newlyStuck += 1;
    oldestStuckHours = Math.max(oldestStuckHours, Math.round(ageMs / 3_600_000));
  }

  const problems: string[] = [];
  if (newlyStuck > 0) {
    problems.push(
      `${newlyStuck} ${newlyStuck === 1 ? "person" : "people"} created an account in the last ` +
        `${freshHours}h and never got in. They cannot report this — to them the code simply did not work.`,
    );
  }

  return {
    totalUsers: accounts.length,
    neverSignedIn,
    newlyStuck,
    backlogStuck: neverSignedIn - newlyStuck,
    oldestStuckHours,
    signedInLastDay,
    problems,
    ok: problems.length === 0,
  };
}
