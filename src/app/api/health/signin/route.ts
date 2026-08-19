import { createHash, timingSafeEqual } from "node:crypto";
import { privateError } from "@/lib/http/request";
import {
  recordServerFailure,
  recordServerFailureReason,
} from "@/lib/observability/server-failures";
import {
  SigninAccountsError,
  listSigninAccounts,
} from "@/lib/observability/signin-accounts.server";
import {
  DEFAULT_FRESH_HOURS,
  assessSigninHealth,
} from "@/lib/observability/signin-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Guards the report behind a shared secret, matching /api/push/schedule.
 *
 * This exists so the scheduler never needs a database credential. The repo is
 * public, and no Supabase secret has ever been placed in its Actions secrets;
 * the server already holds one, so the check runs here and the workflow only
 * carries a token that reads aggregate counts.
 */
function monitorAuthorized(request: Request): boolean {
  const secret = process.env.SIGNIN_HEALTH_SECRET;
  const supplied = request.headers.get("authorization");
  if (!secret || secret.length < 32 || !supplied) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const given = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expected, given);
}

/** Reports whether anyone is newly stuck at sign-in. Counts only, no identities. */
export async function GET(request: Request) {
  if (!monitorAuthorized(request)) return privateError("unauthorized", 401);

  const requested = Number(
    new URL(request.url).searchParams.get("freshHours") ?? DEFAULT_FRESH_HOURS,
  );
  const freshHours =
    Number.isFinite(requested) && requested > 0 && requested <= 24 * 365
      ? requested
      : DEFAULT_FRESH_HOURS;

  try {
    const accounts = await listSigninAccounts();
    const report = assessSigninHealth(accounts, new Date(), { freshHours });
    return Response.json(
      { contract: "biblequest_signin_health_v1", freshHours, ...report },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    // Name the reason. The first production run failed as a blanket "unknown",
    // which said only that something broke, not which thing.
    if (error instanceof SigninAccountsError) {
      recordServerFailureReason("auth", "status", error.reason);
    } else {
      recordServerFailure("auth", "status", error);
    }
    return privateError("unavailable", 503);
  }
}
