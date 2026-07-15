"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "./client";
import { track } from "@/lib/analytics/events";

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

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_IN fires on genuine sign-ins (initial session restore
      // arrives as INITIAL_SESSION) — the account-funnel completion.
      if (event === "SIGNED_IN" && !signInTracked && session?.user) {
        signInTracked = true;
        if (firstTabToTrack(session.user.id)) {
          track("sign_in_completed");
        }
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
