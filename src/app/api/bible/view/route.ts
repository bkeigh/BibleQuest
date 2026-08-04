import { NextResponse } from "next/server";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";
import { API_BIBLE_FUMS_TOKEN } from "@/lib/bible/fums";
import { boundedJson } from "@/lib/http/json";
import {
  recordServerFailure,
  recordServerFailureReason,
} from "@/lib/observability/server-failures";
import {
  distributedPoliciesFromWindows,
  guardDistributedRequest,
} from "@/lib/security/distributed-rate-limit.server";

export const dynamic = "force-dynamic";

const ID = /^[a-zA-Z0-9_-]{8,100}$/;
const VIEW_RATE_LIMITS = [
  { limit: 160, windowMs: 60_000 },
  { limit: 1_000, windowMs: 60 * 60_000 },
] as const;

export async function POST(request: Request) {
  const blocked = guardProviderRequest(request, "bible-view", VIEW_RATE_LIMITS);
  if (blocked) return blocked;

  const body = await boundedJson(request, 4_096);
  if (body instanceof Response) return body;
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

  // Claims the same quotas across every serverless instance after payload validation.
  const distributedBlocked = await guardDistributedRequest(
    request,
    "bible-view",
    distributedPoliciesFromWindows(VIEW_RATE_LIMITS),
  );
  if (distributedBlocked) return distributedBlocked;

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
      recordServerFailureReason("bible", "view_report", "provider");
      return NextResponse.json(
        { error: "report_unavailable" },
        {
          status: 502,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
  } catch (error) {
    recordServerFailure("bible", "view_report", error);
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
