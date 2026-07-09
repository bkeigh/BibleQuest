"use client";

/**
 * Avatar — the user's photo, or a warm initial-letter fallback.
 * Private-feeling by design: this is "my space", not a public profile.
 *
 * The photo lives in IndexedDB (src/lib/utils/avatar.ts); the store only
 * carries `profile.avatarUpdatedAt` as a cache-busting change marker, which
 * callers pass as `marker` so the hook refetches after an upload.
 */
import { useEffect, useState } from "react";
import { loadAvatar } from "@/lib/utils/avatar";
import { cn } from "@/lib/utils/cn";

/** Object URL for the stored photo, refreshed whenever `marker` changes. */
export function useAvatarUrl(marker: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!marker) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    loadAvatar().then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [marker]);
  // Gate on marker at read time (instead of resetting state in the effect)
  // so a removed photo falls back immediately; the cleanup above revokes
  // the stale object URL.
  return marker ? url : null;
}

const SIZES = {
  sm: "h-9 w-9 text-[0.9375rem]",
  md: "h-12 w-12 text-[1.1875rem]",
  lg: "h-20 w-20 text-[1.75rem]",
} as const;

export function Avatar({
  name,
  marker,
  size = "md",
  className,
}: {
  /** Display name — its first letter is the fallback face. */
  name?: string | null;
  /** profile.avatarUpdatedAt (null/undefined = no photo). */
  marker?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const url = useAvatarUrl(marker);
  const initial = (name ?? "").trim().charAt(0).toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-mist bg-accent-surface",
        SIZES[size],
        className
      )}
      aria-hidden="true"
    >
      {url ? (
        // Plain <img>: the source is a same-document blob URL — next/image
        // adds nothing and its loader can't optimize object URLs anyway.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : initial ? (
        <span className="font-display font-medium text-accent">{initial}</span>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-[55%] w-[55%] text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
        >
          <circle cx="12" cy="8.5" r="3.4" />
          <path d="M5.5 19.2c1.3-3 3.8-4.5 6.5-4.5s5.2 1.5 6.5 4.5" />
        </svg>
      )}
    </span>
  );
}
