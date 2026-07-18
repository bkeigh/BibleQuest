import { NextRequest, NextResponse } from "next/server";
import { ApiBibleError, fetchApiBiblePassage } from "@/lib/bible/api-bible";
import { providerBookId } from "@/lib/bible/provider-books";
import { getBookMeta } from "@/lib/bible";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const code = error instanceof ApiBibleError ? error.code : "content_unavailable";
  const status = code === "provider_not_configured" ? 503 : code === "translation_unavailable" ? 404 : 502;
  return NextResponse.json(
    { error: code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const blocked = guardProviderRequest(request, "bible-passage", [
    { limit: 50, windowMs: 60_000 },
    { limit: 300, windowMs: 60 * 60_000 },
  ]);
  if (blocked) return blocked;

  const translation = request.nextUrl.searchParams.get("translation") ?? "";
  const book = request.nextUrl.searchParams.get("book") ?? "";
  const chapter = Number(request.nextUrl.searchParams.get("chapter"));
  const start = Number(request.nextUrl.searchParams.get("start"));
  const end = Number(request.nextUrl.searchParams.get("end"));
  const meta = getBookMeta(book);
  const bookId = providerBookId(book);
  const verseCount = meta?.verseCounts[chapter - 1] ?? 0;
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
    end > verseCount ||
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

  try {
    const provider = await fetchApiBiblePassage(
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
    return errorResponse(error);
  }
}
