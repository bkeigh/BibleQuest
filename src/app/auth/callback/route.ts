import { NextResponse } from "next/server";
import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * OAuth / magic-link callback. Supabase redirects here with a `code`; we
 * exchange it for a session cookie, then return the user to the app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/app";

  if (code && isSupabaseConfigured()) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/app/account?error=signin", url.origin));
}
