import { NextRequest, NextResponse } from "next/server";
import { providerBookId } from "@/lib/bible/provider-books";
import {
  bibleProviderErrorCode,
  bibleProviderErrorResponse,
  fetchBibleProviderPassage,
} from "@/lib/bible/provider-dispatcher";
import { getBookMeta } from "@/lib/bible";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";
import {
  classifyServerFailure,
  recordServerFailureReason,
} from "@/lib/observability/server-failures";
import {
  distributedPoliciesFromWindows,
  guardDistributedRequest,
} from "@/lib/security/distributed-rate-limit.server";

export const dynamic = "force-dynamic";

const PASSAGE_RATE_LIMITS = [
  { limit: 50, windowMs: 60_000 },
  { limit: 300, windowMs: 60 * 60_000 },
] as const;

/** Records operational provider failures before returning the shared response. */
function observedErrorResponse(error: unknown) {
  const code = bibleProviderErrorCode(error);
  // Missing catalogue coverage is normal; provider and configuration failures
  // are the branches an operator otherwise cannot see.
  if (code !== "translation_unavailable") {
    recordServerFailureReason(
      "bible",
      "passage",
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
    "bible-passage",
    PASSAGE_RATE_LIMITS,
  );
  if (blocked) return blocked;

  const translation = request.nextUrl.searchParams.get("translation") ?? "";
  const book = request.nextUrl.searchParams.get("book") ?? "";
  const chapter = Number(request.nextUrl.searchParams.get("chapter"));
  const start = Number(request.nextUrl.searchParams.get("start"));
  const end = Number(request.nextUrl.searchParams.get("end"));
  const meta = getBookMeta(book);
  const bookId = providerBookId(book);
  if (
    !translation ||
    translation.length > 80 ||
    !meta ||
    !bookId ||
    !Number.isInteger(chapter) ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    chapter < 1 ||
    chapter > meta.chapterCount ||
    start < 1 ||
    end < start ||
    end > 200 ||
    // Current app passages are one saved verse or a daily passage (maximum 4
    // verses). A small margin supports future curated passages without leaving
    // a broad consecutive-text extraction endpoint.
    end - start > 7
  ) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Claims the same quotas across every serverless instance after cheap validation.
  const distributedBlocked = await guardDistributedRequest(
    request,
    "bible-passage",
    distributedPoliciesFromWindows(PASSAGE_RATE_LIMITS),
  );
  if (distributedBlocked) return distributedBlocked;

  try {
    const provider = await fetchBibleProviderPassage(
      translation,
      bookId,
      chapter,
      start,
      end,
    );
    return NextResponse.json(provider, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return observedErrorResponse(error);
  }
}
