import { NextResponse, type NextRequest } from "next/server";
import { rateLimitProviderRequest } from "@/lib/bible/provider-request-guard";
import { translationMetadata } from "@/lib/bible/translations";
import { updateSession } from "@/lib/supabase/middleware";

/** Refresh the optional Supabase session before matched app requests. */
export async function proxy(request: NextRequest) {
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
  return await updateSession(request);
}

export const config = {
  // Run on app pages; skip static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
