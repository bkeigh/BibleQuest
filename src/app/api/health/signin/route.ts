import { createHash, timingSafeEqual } from "node:crypto";
import { privateError } from "@/lib/http/request";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { recordServerFailure } from "@/lib/observability/server-failures";
import {
  DEFAULT_FRESH_HOURS,
  assessSigninHealth,
  type SigninHealthAccount,
} from "@/lib/observability/signin-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PAGES = 50;
const PAGE_SIZE = 200;

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
    const admin = createAdminSupabase();
    const accounts: SigninHealthAccount[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: PAGE_SIZE,
      });
      if (error) {
        recordServerFailure("auth", "status", error);
        return privateError("unavailable", 503);
      }
      const batch = data?.users ?? [];
      for (const user of batch) {
        accounts.push({
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
        });
      }
      if (batch.length < PAGE_SIZE) break;
    }

    const report = assessSigninHealth(accounts, new Date(), { freshHours });
    return Response.json(
      { contract: "biblequest_signin_health_v1", freshHours, ...report },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    recordServerFailure("auth", "status", error);
    return privateError("unavailable", 503);
  }
}
