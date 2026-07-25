import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "./client";
import { accountSyncAvailable } from "@/lib/sync/containment";

/**
 * Refreshes the Supabase auth session cookie on each request so server
 * components see a valid session. No-ops when Supabase isn't configured or
 * guest-only containment is active, so local mode is completely unaffected.
 *
 * Follows the @supabase/ssr guidance: do not run logic between createServerClient
 * and getUser(), and always return the response object it produces.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Contained builds must not create a server client or refresh a session,
  // even if Supabase environment variables remain available for later rollout.
  if (!accountSyncAvailable(isSupabaseConfigured())) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
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
