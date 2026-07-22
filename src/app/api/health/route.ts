import { NextResponse } from "next/server";
import { buildReleaseHealth } from "@/lib/observability/release";

/** Exposes only bounded, non-secret deployment posture for external checks. */
export function GET() {
  return NextResponse.json(buildReleaseHealth(), {
    headers: { "Cache-Control": "no-store" },
  });
}
