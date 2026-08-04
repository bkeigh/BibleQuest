import { NextRequest, NextResponse } from "next/server";
import { providerBookId } from "@/lib/bible/provider-books";
import {
  bibleProviderErrorCode,
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
import { guardDistributedRequest } from "@/lib/security/distributed-rate-limit.server";

export const dynamic = "force-dynamic";

const CHAPTER_RATE_LIMITS = [
  { limit: 30, windowMs: 60_000 },
  { limit: 180, windowMs: 60 * 60_000 },
] as const;

function errorResponse(error: unknown) {
  const code = bibleProviderErrorCode(error);
  const status = code === "provider_not_configured" ? 503 : code === "translation_unavailable" ? 404 : 502;
  // Missing catalogue coverage is normal; provider and configuration failures
  // are the branches an operator otherwise cannot see.
  if (status !== 404) {
    recordServerFailureReason(
      "bible",
      "chapter",
      code === "provider_not_configured"
        ? "configuration"
        : classifyServerFailure(error),
    );
  }
  return NextResponse.json(
    { error: code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
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

  // Claims the same quotas across every serverless instance after cheap validation.
  const distributedBlocked = await guardDistributedRequest(
    request,
    "bible-chapter",
    CHAPTER_RATE_LIMITS.map(({ limit, windowMs }) => ({
      limit,
      windowSeconds: windowMs / 1_000,
    })),
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
    return errorResponse(error);
  }
}
