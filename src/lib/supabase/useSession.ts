"use client";

/**
 * Small auth adapter shared by client components. It presents configured,
 * loading, and user state consistently while deduplicating sign-in analytics
 * across the several mounted consumers and open browser tabs.
 */
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "./client";
import { track } from "@/lib/analytics/events";
import {
  classifyOperationalError,
  reportClientSignal,
} from "@/lib/observability/client-signals";
import {
  authEventCompletesSignIn,
  consumeAuthCompletionSignal,
} from "@/lib/auth/completion-signal";

// One funnel event per real sign-in — not per mounted hook instance
// (several components subscribe at once) and not per open tab (supabase
// broadcasts SIGNED_IN to every tab). The cross-tab guard is a short-lived
// localStorage stamp; localStorage failures just fall back to per-tab.
let signInTracked = false;
const SIGNIN_STAMP_KEY = "biblequest:signin-tracked";

function firstTabToTrack(userId: string): boolean {
  try {
    const raw = window.localStorage.getItem(SIGNIN_STAMP_KEY);
    if (raw) {
      const [id, at] = raw.split("|");
      if (id === userId && Date.now() - Number(at) < 15_000) return false;
    }
    window.localStorage.setItem(SIGNIN_STAMP_KEY, `${userId}|${Date.now()}`);
    return true;
  } catch {
    return true;
  }
}

interface SessionState {
  user: User | null;
  loading: boolean;
  configured: boolean;
}

function trackCompletedSignIn(userId: string) {
  if (signInTracked) return;
  signInTracked = true;
  if (firstTabToTrack(userId)) {
    track("sign_in_completed");
    reportClientSignal({
      surface: "auth",
      stage: "session",
      outcome: "success",
      category: "ok",
    });
  }
}

/**
 * Subscribes to the Supabase auth state. When Supabase isn't configured it
 * returns a stable signed-out state so guest mode renders normally.
 */
export function useSession(): SessionState {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    const supabase = createClient();
    let active = true;

    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          reportClientSignal({
            surface: "auth",
            stage: "session",
            outcome: "failure",
            category: classifyOperationalError(error),
          });
        }
        if (data.user && consumeAuthCompletionSignal()) {
          trackCompletedSignIn(data.user.id);
        }
        setUser(data.user ?? null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        reportClientSignal({
          surface: "auth",
          stage: "session",
          outcome: "failure",
          category: classifyOperationalError(error),
        });
        setUser(null);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Server callback round trips restore as INITIAL_SESSION, while in-page
      // auth can emit SIGNED_IN. The one-shot cookie makes both paths count
      // exactly once without putting identity or tokens in client state.
      const callbackCompleted = session?.user
        ? consumeAuthCompletionSignal()
        : false;
      if (
        session?.user &&
        authEventCompletesSignIn(event, callbackCompleted)
      ) {
        trackCompletedSignIn(session.user.id);
      }
      if (event === "SIGNED_OUT") signInTracked = false;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  return { user, loading, configured };
}
