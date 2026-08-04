import { MAX_BILLING_REQUEST_BYTES } from "@/lib/billing/validation";
import { boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import { arcadeStoreContractReady } from "@/lib/games/arcade/server";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHAPTER_ID = /^day-[1-7]$/;

/** Atomically redeems one owned Question Skip for a completed chapter. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const body = await boundedJson(request, MAX_BILLING_REQUEST_BYTES);
  if (body instanceof Response) return body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).join(",") !== "chapterId" ||
    typeof (body as { chapterId?: unknown }).chapterId !== "string" ||
    !CHAPTER_ID.test((body as { chapterId: string }).chapterId)
  ) {
    return privateError("invalid_request", 400);
  }
  try {
    const admin = createAdminSupabase();
    if (!(await arcadeStoreContractReady(context.supabase))) {
      return privateError("unavailable", 503);
    }
    const { data, error } = await admin.rpc(
      "consume_arcade_question_skip",
      {
        p_user_id: context.user.id,
        p_chapter_id: (body as { chapterId: string }).chapterId,
      },
    );
    if (
      error ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof (data as { consumed?: unknown }).consumed !== "boolean" ||
      !Number.isInteger((data as { remaining?: unknown }).remaining)
    ) {
      return privateError("unavailable", 503);
    }
    if (!(data as { consumed: boolean }).consumed) {
      return privateError("none_available", 409);
    }
    return Response.json(
      {
        consumed: true,
        remaining: (data as { remaining: number }).remaining,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return privateError("unavailable", 503);
  }
}
