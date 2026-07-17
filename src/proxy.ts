import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Refresh the optional Supabase session before matched app requests. */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on app pages; skip static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
