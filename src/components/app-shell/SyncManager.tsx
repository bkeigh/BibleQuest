"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/supabase/useSession";
import { startSync, stopSync } from "@/lib/sync/engine";

/**
 * Runs the account sync engine while a user is signed in. Renders nothing and
 * does nothing in guest mode or when Supabase isn't configured — the app stays
 * fully local-first either way.
 */
export function SyncManager() {
  const { user, configured } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!configured) return;
    if (userId) {
      startSync(userId);
    } else {
      stopSync();
    }
  }, [configured, userId]);

  useEffect(() => () => stopSync(), []);

  return null;
}
