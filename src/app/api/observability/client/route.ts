import { NextResponse } from "next/server";
import observability from "../../../../../config/observability.json";
import { safeClientSignalLog } from "@/lib/observability/client-signals";

const MAX_BODY_BYTES = 512;

/** Accepts only canonical or local same-origin browser posts. */
function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === observability.canonicalOrigin) return true;
  if (
    process.env.VERCEL_URL &&
    origin === `https://${process.env.VERCEL_URL}`
  ) {
    return true;
  }
  try {
    const url = new URL(origin);
    return (
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

/** Records a reconstructed content-free browser health signal. */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !allowedOrigin(request) ||
    contentType !== "application/json" ||
    !Number.isFinite(contentLength) ||
    contentLength > MAX_BODY_BYTES
  ) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  let candidate: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ accepted: false }, { status: 413 });
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
