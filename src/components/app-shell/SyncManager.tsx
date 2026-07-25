"use client";

import { useEffect, useReducer } from "react";
import { useSession } from "@/lib/supabase/useSession";
import { createClient } from "@/lib/supabase/client";
import { startSync, stopSync } from "@/lib/sync/engine";
import {
  localDataBelongsToOtherUser,
} from "@/lib/sync/last-user";
import { prepareLocalJourneyHandoff } from "@/lib/sync/handoff";
import { clearAvatar } from "@/lib/utils/avatar";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";

/**
 * Runs the account sync engine while a user is signed in. Renders nothing and
 * does nothing in guest mode or when Supabase isn't configured — the app stays
 * fully local-first either way.
 *
 * One exception renders: sign-out keeps the journey on this device, so when a
 * DIFFERENT account signs in over it, this device still holds the previous
 * account's private prayers and reflections. Syncing blindly would merge them
 * into the new account, so a blocking dialog asks first: start fresh, or claim
 * the local journey. Until it's answered, startSync refuses to run (the engine
 * checks the same ownership marker), so no merge can start behind the dialog.
 */
export function SyncManager() {
  const { user, configured } = useSession();
  const userId = user?.id ?? null;
  // The ownership marker in localStorage is the actual state; this only
  // forces a re-render after resolve() updates it.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // Safe to read during render: on the server (and at hydration, when the
  // session hasn't loaded yet) userId is null, so both sides render nothing.
  const handoff = Boolean(
    configured && userId && localDataBelongsToOtherUser(userId)
  );

  useEffect(() => {
    if (!configured) return;
    // Stop any previous account before asking about a hand-off. startSync also
    // refuses the mismatched owner, but leaving the old subscriber alive while
    // the dialog is open would let it keep writing under the wrong session.
    if (handoff) {
      stopSync();
    } else if (userId) {
      startSync(userId);
    } else {
      stopSync();
    }
  }, [configured, handoff, userId]);

  useEffect(() => () => stopSync(), []);

  if (!handoff) return null;

  const resolve = async (startFresh: boolean) => {
    if (!userId) return;
    // The engine never started (startSync refuses while the marker
    // mismatches), so clearing here can't race a push.
    if (startFresh) await clearAvatar();
    prepareLocalJourneyHandoff(userId, startFresh);
    startSync(userId);
    rerender();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dusk/20 px-6 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sync-handoff-title"
        aria-describedby="sync-handoff-desc"
        className="w-full max-w-sm"
      >
        <PaperCard variant="paper" padding="lg">
          <h2
            id="sync-handoff-title"
            className="text-[1.125rem] leading-snug text-graphite"
          >
            This device holds another journey
          </h2>
          <p
            id="sync-handoff-desc"
            className="mt-2 text-small leading-relaxed text-charcoal"
          >
            The journey saved here was last synced by a different account.
            Prayers and reflections stay private, so nothing will be merged
            into your account without asking.
          </p>

          <GentleButton
            variant="primary"
            size="md"
            fullWidth
            autoFocus
            className="mt-5"
            onClick={() => void resolve(true)}
          >
            Start fresh with my account
          </GentleButton>
          <p className="mt-1.5 text-caption leading-relaxed text-ash">
            Removes the other journey from this device, then brings in yours.
          </p>

          <GentleButton
            variant="outline"
            size="md"
            fullWidth
            className="mt-4"
            onClick={() => void resolve(false)}
          >
            This is my journey — keep it
          </GentleButton>
          <p className="mt-1.5 text-caption leading-relaxed text-ash">
            Keeps everything on this device and adds it to your account.
          </p>

          <GentleButton
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() => void createClient().auth.signOut()}
          >
            Not sure? Sign out for now
          </GentleButton>
        </PaperCard>
      </div>
    </div>
  );
}
