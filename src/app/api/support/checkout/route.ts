import { type NextRequest, NextResponse } from "next/server";
import { getStripeDonationUrl } from "@/lib/support/server";

export const dynamic = "force-dynamic";

/**
 * Stable same-origin handoff to a validated Stripe Payment Link. A missing or
 * malformed destination fails closed and returns the visitor to an explanatory
 * page; arbitrary hosts can never become an open redirect.
 */
export function GET(request: NextRequest) {
  const destination = getStripeDonationUrl();
  if (!destination) {
    return NextResponse.redirect(
      new URL("/support?status=unavailable", request.url),
      303
    );
  }

  return NextResponse.redirect(destination, 307);
}
