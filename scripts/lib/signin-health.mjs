/**
 * Decides whether sign-in looks broken, from the user list alone.
 *
 * Kept free of network and clock access so the thresholds can be tested
 * directly. `scripts/check-signin-health.mjs` supplies the real inputs.
 *
 * The signal is a person who created an account and never signed in. Supabase
 * omits `last_sign_in_at` entirely until a first successful sign-in, so its
 * absence is the fact — no inference required.
 */

export const DEFAULT_FRESH_HOURS = 48;

/**
 * Splits never-signed-in accounts into the ones worth waking someone for and
 * the historical backlog.
 *
 * Only the fresh ones raise a problem. The backlog is reported but never
 * alerts: five accounts have been stuck since well before this check existed,
 * and an alert that fires every run for a known number is one people learn to
 * ignore — which is how the original failures went unnoticed for days.
 */
export function assessSigninHealth(users, now, options = {}) {
  const freshHours = options.freshHours ?? DEFAULT_FRESH_HOURS;
  if (!Array.isArray(users)) throw new TypeError("users must be an array");
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

  for (const user of users) {
    const createdAt = Date.parse(user?.created_at ?? "");
    const lastSignIn = user?.last_sign_in_at
      ? Date.parse(user.last_sign_in_at)
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

  const problems = [];
  if (newlyStuck > 0) {
    problems.push(
      `${newlyStuck} ${newlyStuck === 1 ? "person" : "people"} created an account in the last ` +
        `${freshHours}h and never got in. They cannot report this — to them the code simply did not work.`,
    );
  }

  return {
    totalUsers: users.length,
    neverSignedIn,
    newlyStuck,
    backlogStuck: neverSignedIn - newlyStuck,
    oldestStuckHours,
    signedInLastDay,
    problems,
    ok: problems.length === 0,
  };
}
