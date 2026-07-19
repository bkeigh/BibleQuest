import { NextResponse } from "next/server";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";
import { API_BIBLE_FUMS_TOKEN } from "@/lib/bible/fums";

export const dynamic = "force-dynamic";

const ID = /^[a-zA-Z0-9_-]{8,100}$/;

export async function POST(request: Request) {
  const blocked = guardProviderRequest(request, "bible-view", [
    { limit: 160, windowMs: 60_000 },
    { limit: 1_000, windowMs: 60 * 60_000 },
  ]);
  if (blocked) return blocked;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 4_096) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 413, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4_096) {
      return NextResponse.json(
        { error: "invalid_request" },
        { status: 413, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const value = body as { token?: unknown; deviceId?: unknown; sessionId?: unknown };
  if (
    typeof value.token !== "string" ||
    typeof value.deviceId !== "string" ||
    typeof value.sessionId !== "string" ||
    !API_BIBLE_FUMS_TOKEN.test(value.token) ||
    !ID.test(value.deviceId) ||
    !ID.test(value.sessionId)
  ) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const query = new URLSearchParams({
    t: value.token,
    dId: value.deviceId,
    sId: value.sessionId,
  });
  try {
    const response = await fetch(`https://fums.api.bible/f3?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "report_unavailable" },
        {
          status: 502,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "report_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}
