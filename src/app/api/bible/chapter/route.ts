import { NextRequest, NextResponse } from "next/server";
import { providerBookId } from "@/lib/bible/provider-books";
import {
  bibleProviderErrorCode,
  bibleProviderErrorResponse,
  fetchBibleProviderChapter,
  serializeBibleProviderChapter,
} from "@/lib/bible/provider-dispatcher";
import { getBookMeta } from "@/lib/bible";
import { loadChapter } from "@/lib/bible/server";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";
import {
  classifyServerFailure,
  recordServerFailureReason,
} from "@/lib/observability/server-failures";
import {
  distributedPoliciesFromWindows,
  guardGuestBibleReadDistributedRequest,
} from "@/lib/security/distributed-rate-limit.server";

export const dynamic = "force-dynamic";

const CHAPTER_RATE_LIMITS = [
  { limit: 30, windowMs: 60_000 },
  { limit: 180, windowMs: 60 * 60_000 },
] as const;

/** Records operational provider failures before returning the shared response. */
function observedErrorResponse(error: unknown) {
  const code = bibleProviderErrorCode(error);
  // Missing catalogue coverage is normal; provider and configuration failures
  // are the branches an operator otherwise cannot see.
  if (code !== "translation_unavailable") {
    recordServerFailureReason(
      "bible",
      "chapter",
      code === "provider_not_configured"
        ? "configuration"
        : classifyServerFailure(error),
    );
  }
  return bibleProviderErrorResponse(error);
}

export async function GET(request: NextRequest) {
  const blocked = guardProviderRequest(
    request,
    "bible-chapter",
    CHAPTER_RATE_LIMITS,
  );
  if (blocked) return blocked;

  const translation = request.nextUrl.searchParams.get("translation") ?? "";
  const book = request.nextUrl.searchParams.get("book") ?? "";
  const chapter = Number(request.nextUrl.searchParams.get("chapter"));
  const meta = getBookMeta(book);
  const bookId = providerBookId(book);
  if (
    !translation ||
    translation.length > 80 ||
    !meta ||
    !bookId ||
    !Number.isInteger(chapter) ||
    chapter < 1 ||
    chapter > meta.chapterCount
  ) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Uses shared quotas when healthy and the local window on dependency failure.
  const distributedBlocked = await guardGuestBibleReadDistributedRequest(
    request,
    "bible-chapter",
    distributedPoliciesFromWindows(CHAPTER_RATE_LIMITS),
  );
  if (distributedBlocked) return distributedBlocked;

  try {
    const [provider, fallback] = await Promise.all([
      fetchBibleProviderChapter(translation, bookId, chapter),
      loadChapter(book, chapter),
    ]);
    if (!fallback) {
      return NextResponse.json(
        { error: "content_unavailable" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const verses = serializeBibleProviderChapter(provider.verses);
    return NextResponse.json(
      {
        translation: provider.translation,
        verses,
        requestedKey: provider.requestedKey,
        fallbackReason: provider.fallbackReason,
        fumsToken: provider.fumsToken,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return observedErrorResponse(error);
  }
}
