import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "./configuration";
import { supabasePublishableKey } from "./config";

/**
 * Refreshes only the operator console's legacy Supabase cookie. Customer auth
 * is browser-owned and bearer-only, so ordinary pages and APIs never receive
 * a server session write. Local mode remains completely unaffected.
 *
 * Follows the @supabase/ssr guidance: do not run logic between createServerClient
 * and getUser(), and always return the response object it produces.
 */
export async function updateSession(
  request: NextRequest,
  rewriteUrl?: URL,
  refreshLegacyConsoleSession = false,
) {
  const responseForRequest = () => {
    const forwardedHeaders = new Headers(request.headers);
    // The proxy owns this marker so a caller cannot spoof clean console URLs.
    if (rewriteUrl) forwardedHeaders.set("x-biblequest-console-host", "1");
    else forwardedHeaders.delete("x-biblequest-console-host");

    const requestInit = { request: { headers: forwardedHeaders } };
    return rewriteUrl
      ? NextResponse.rewrite(rewriteUrl, requestInit)
      : NextResponse.next(requestInit);
  };
  let response = responseForRequest();

  // The private console is the sole owner of the legacy server cookie. The
  // account-sync flag must never reopen middleware writes for customer pages.
  if (!isSupabaseConfigured() || !refreshLegacyConsoleSession) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublishableKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = responseForRequest();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          // Service workers cannot reliably inspect Set-Cookie because Fetch
          // filters it in browser response headers. Make the same response
          // explicitly uncacheable so auth refreshes never enter Cache Storage.
          response.headers.set("Cache-Control", "private, no-store");
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}
