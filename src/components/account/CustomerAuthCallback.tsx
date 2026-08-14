"use client";

import { useEffect, useRef } from "react";
import { AppLoadingScreen } from "@/components/app-shell/AppLoadingScreen";
import { markAuthCompletionSignal } from "@/lib/auth/completion-signal";
import { safeNextPath } from "@/lib/auth/redirect";
import { completeVerifiedWebOAuth } from "@/lib/supabase/web-auth-storage";
import { withWebAccountOperationLock } from "@/lib/supabase/web-auth-storage";

const MAX_AUTHORIZATION_CODE_LENGTH = 4_096;

/** Parses only the exact bounded fragment emitted by the server callback. */
function callbackFragment(value: string): { code: string; next: string } | null {
  const params = new URLSearchParams(value.startsWith("#") ? value.slice(1) : value);
  if (
    [...params.keys()].some((key) => key !== "code" && key !== "next") ||
    params.getAll("code").length !== 1 ||
    params.getAll("next").length !== 1
  ) {
    return null;
  }
  const code = params.get("code");
  if (
    !code ||
    code.length > MAX_AUTHORIZATION_CODE_LENGTH ||
    !/^[\x21-\x7e]+$/.test(code)
  ) {
    return null;
  }
  return { code, next: safeNextPath(params.get("next")) };
}

/** Returns one generic same-origin failure path without reflecting provider data. */
function callbackFailurePath(next: string): string {
  const destination = new URL(next, "https://biblequest.invalid");
  const path = destination.pathname === "/onboarding" ? "/onboarding" : "/app/account";
  return `${path}?error=invalid`;
}

/** Completes customer PKCE only inside the browser-owned v2 session boundary. */
export function CustomerAuthCallback() {
  const completionStarted = useRef(false);

  useEffect(() => {
    // React development replays effects; only the first pass may consume the
    // one-use fragment or start an authorization-code exchange.
    if (completionStarted.current) return;
    completionStarted.current = true;
    const fragment = callbackFragment(window.location.hash);
    // Strip the opaque code before any awaited work, render, or navigation.
    window.history.replaceState(null, "", window.location.pathname);
    if (!fragment) {
      window.location.replace("/app/account?error=invalid");
      return;
    }

    void withWebAccountOperationLock((handle) =>
      completeVerifiedWebOAuth(fragment.code, handle),
    ).then(
      () => {
        markAuthCompletionSignal();
        window.location.replace(fragment.next);
      },
      () => {
        window.location.replace(callbackFailurePath(fragment.next));
      },
    );
  }, []);

  return <AppLoadingScreen label="Finishing secure sign-in" />;
}
