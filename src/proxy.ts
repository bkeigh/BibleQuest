import { NextResponse, type NextRequest } from "next/server";
import { rateLimitProviderRequest } from "@/lib/bible/provider-request-guard";
import { translationMetadata } from "@/lib/bible/translations";
import { updateSession } from "@/lib/supabase/middleware";
import {
  consoleRewritePath,
  isConsoleRequestHost,
} from "@/lib/console/paths";

/** Refresh the optional Supabase session before matched app requests. */
export async function proxy(request: NextRequest) {
  const consolePath = consoleRewritePath(
    request.headers.get("host"),
    request.nextUrl.pathname,
    request.headers.get("x-forwarded-host"),
  );
  const consoleUrl = consolePath ? request.nextUrl.clone() : undefined;
  if (consoleUrl) consoleUrl.pathname = consolePath!;
  const consoleSessionRequest =
    process.env.BIBLEQUEST_CONSOLE_AUTH_ENABLED === "true" &&
    (isConsoleRequestHost(
      request.headers.get("host"),
      request.headers.get("x-forwarded-host"),
    ) ||
      request.nextUrl.pathname === "/console" ||
      request.nextUrl.pathname.startsWith("/console/"));

  const requestedTranslation = translationMetadata(
    request.nextUrl.searchParams.get("translation"),
  );
  if (
    request.nextUrl.pathname.startsWith("/verse/") &&
    requestedTranslation?.source === "helloao"
  ) {
    const limited = rateLimitProviderRequest(request, "public-bible-verse", [
      { limit: 40, windowMs: 60_000 },
      { limit: 300, windowMs: 60 * 60_000 },
    ]);
    if (limited) {
      // Keep an over-limit shared link useful without spending another remote
      // provider render: transparently retry the same canonical verse in WEB.
      const fallbackUrl = request.nextUrl.clone();
      fallbackUrl.searchParams.delete("translation");
      const response = NextResponse.redirect(fallbackUrl, 307);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set(
        "Retry-After",
        limited.headers.get("Retry-After") ?? "60",
      );
      return response;
    }
  }
  const response = await updateSession(
    request,
    consoleUrl,
    consoleSessionRequest,
  );
  if (consoleUrl) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Run on app pages; skip static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
