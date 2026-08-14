"use client";

import { useEffect } from "react";
import {
  downloadRemoteAvatar,
  uploadRemoteAvatar,
} from "@/lib/avatar/client";
import { useQuestOS } from "@/lib/questos/store";
import { useSession } from "@/lib/supabase/useSession";
import { localDataBelongsToOtherUser } from "@/lib/sync/last-user";
import {
  clearAvatar,
  clearLegacyAvatar,
  loadAvatar,
  loadLegacyAvatar,
  migrateLegacyAvatar,
  profileAvatarMarker,
  storeRemoteAvatar,
} from "@/lib/utils/avatar";

/** Reconciles the private account avatar with its versioned device cache. */
export function AvatarSyncManager() {
  const { user, configured, loading } = useSession();
  const marker = useQuestOS((state) => profileAvatarMarker(state.profile));
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    const controller = new AbortController();
    let running = false;

    const reconcile = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        const state = useQuestOS.getState();
        const profile = state.profile;
        if (!profile) return;

        if (!userId) {
          if (marker) await migrateLegacyAvatar(marker);
          return;
        }
        if (!configured) return;
        if (localDataBelongsToOtherUser(userId)) return;

        const expectedUserId = userId;

        const remote = await downloadRemoteAvatar(
          expectedUserId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (remote) {
          const cached = await loadAvatar(remote.version);
          if (controller.signal.aborted) return;
          if (
            !cached &&
            !(await storeRemoteAvatar(remote.blob, remote.version))
          ) {
            return;
          }
          if (controller.signal.aborted) return;
          if (
            profile.avatarVersion !== remote.version ||
            profile.avatarUpdatedAt !== remote.updatedAt
          ) {
            state.updateProfile({
              avatarVersion: remote.version,
              avatarUpdatedAt: remote.updatedAt,
            });
          }
          await clearLegacyAvatar();
          return;
        }

        // A pre-sync local image migrates only when the account has no remote
        // pointer. Once an account version existed, remote deletion wins.
        const localMarker = profileAvatarMarker(profile);
        const local =
          profile.avatarVersion == null
            ? (localMarker ? await loadAvatar(localMarker) : null) ??
              (await loadLegacyAvatar())
            : null;
        if (local) {
          if (controller.signal.aborted) return;
          const extension =
            local.type === "image/png"
              ? "png"
              : local.type === "image/jpeg"
                ? "jpg"
                : "webp";
          const uploaded = await uploadRemoteAvatar(
            expectedUserId,
            new File([local], `avatar.${extension}`, { type: local.type }),
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (!(await storeRemoteAvatar(uploaded.blob, uploaded.version))) {
            return;
          }
          if (controller.signal.aborted) return;
          state.updateProfile({
            avatarVersion: uploaded.version,
            avatarUpdatedAt: uploaded.updatedAt,
          });
          await clearLegacyAvatar();
          return;
        }

        if (localMarker) {
          await clearAvatar(localMarker);
          if (controller.signal.aborted) return;
          state.updateProfile({
            avatarVersion: null,
            avatarUpdatedAt: null,
          });
        }
      } catch {
        // Offline, unavailable, and aborted requests leave local state intact.
      } finally {
        running = false;
      }
    };

    void reconcile();
    window.addEventListener("online", reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      controller.abort();
      window.removeEventListener("online", reconcile);
      window.removeEventListener("focus", reconcile);
    };
  }, [configured, loading, marker, userId]);

  return null;
}
