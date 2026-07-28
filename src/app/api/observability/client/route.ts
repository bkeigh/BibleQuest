import { NextResponse } from "next/server";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";
import { boundedText } from "@/lib/http/json";
import { safeClientSignalLog } from "@/lib/observability/client-signals";

const MAX_BODY_BYTES = 512;
const SIGNAL_RATE_POLICIES = [
  { limit: 60, windowMs: 60_000 },
  { limit: 300, windowMs: 15 * 60_000 },
] as const;

/** Requires the browser-supplied origin to match the endpoint being called. */
function hasExactOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Records a reconstructed content-free browser health signal. */
export async function POST(request: Request) {
  const blocked = guardProviderRequest(
    request,
    "observability-client",
    SIGNAL_RATE_POLICIES,
  );
  if (blocked) return blocked;

  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !hasExactOrigin(request) ||
    contentType !== "application/json" ||
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > MAX_BODY_BYTES
  ) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  let candidate: unknown;
  try {
    const body = await boundedText(request, MAX_BODY_BYTES);
    if (body instanceof Response) {
      return NextResponse.json(
        { accepted: false },
        { status: body.status },
      );
    }
    candidate = JSON.parse(body);
  } catch {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const safeLog = safeClientSignalLog(candidate);
  if (!safeLog) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  console.info(JSON.stringify(safeLog));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
