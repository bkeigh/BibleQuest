"use client";

import { useSession } from "@/lib/supabase/useSession";
import { Disclosure } from "@/components/design-system/Disclosure";
import Link from "next/link";
import {
  ACCOUNT_SYNC_CONTAINED,
  ACCOUNT_SYNC_CONTAINMENT_NOTICE,
} from "@/lib/sync/containment";
import { buildPublicHref } from "@/lib/platform/api";

export function JournalPrivacyNote() {
  const { user, loading, configured } = useSession();
  const accountSync = configured && !loading && Boolean(user);

  return (
    <Disclosure
      label={
        <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-accent">
          <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
          {ACCOUNT_SYNC_CONTAINED
            ? "Saved on this device"
            : loading && configured
              ? "Checking storage…"
              : accountSync
                ? "Private account sync"
                : "Saved on this device"}
        </span>
      }
      className="rounded-[var(--radius-button)] border border-mist bg-paper/65 px-3.5 py-1"
    >
      <div className="space-y-2 pb-2 text-[0.8125rem] leading-relaxed text-ash">
        <p>
          {ACCOUNT_SYNC_CONTAINED
            ? ACCOUNT_SYNC_CONTAINMENT_NOTICE
            : accountSync
              ? "Saved entries are stored in this browser and synced to your BibleQuest account behind per-user access controls."
              : "Saved entries are stored in this browser on this device. Sign in if you want them to sync to your BibleQuest account."}
        </p>
        <p>
          Unfinished drafts stay on this device. Journal text is never included
          in analytics or sent to AI.
        </p>
        <Link
          href={buildPublicHref("/privacy")}
          className="inline-flex min-h-11 items-center font-medium text-accent"
        >
          Read the privacy policy
        </Link>
      </div>
    </Disclosure>
  );
}
