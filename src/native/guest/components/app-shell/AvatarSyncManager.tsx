"use client";

import { useEffect } from "react";
import { useQuestOS } from "@/lib/questos/store";
import {
  migrateLegacyAvatar,
  profileAvatarMarker,
} from "@/lib/utils/avatar";

/** Preserves device-only avatar migration without importing remote account code. */
export function AvatarSyncManager() {
  const marker = useQuestOS((state) => profileAvatarMarker(state.profile));

  useEffect(() => {
    if (!marker) return;
    void migrateLegacyAvatar(marker).catch(() => undefined);
  }, [marker]);

  return null;
}
