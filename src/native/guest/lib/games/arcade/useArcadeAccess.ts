"use client";

import type { ArcadeProductId } from "@/lib/games/arcade/store";

interface GuestArcadeAccess {
  available: boolean;
  gamePass: boolean;
  questionSkips: number;
  loading: boolean;
  signedIn: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startCheckout: (product: ArcadeProductId) => Promise<boolean>;
  consumeQuestionSkip: (chapterId: string) => Promise<boolean>;
}

/** Keeps every guest arcade entitlement and consumable action local and empty. */
const GUEST_ARCADE_ACCESS: Readonly<GuestArcadeAccess> = Object.freeze({
  available: false,
  gamePass: false,
  questionSkips: 0,
  loading: false,
  signedIn: false,
  error: null,
  refresh: async () => undefined,
  startCheckout: async (_product: ArcadeProductId) => {
    void _product;
    return false;
  },
  consumeQuestionSkip: async (_chapterId: string) => {
    void _chapterId;
    return false;
  },
});

/** Returns one immutable no-commerce state without importing a transport. */
export function useArcadeAccess() {
  return GUEST_ARCADE_ACCESS;
}
