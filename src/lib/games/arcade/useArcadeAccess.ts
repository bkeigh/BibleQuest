"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedApiFetch } from "@/lib/platform/api";
import { webCommerceAvailable } from "@/lib/platform/purchases";
import { useSession } from "@/lib/supabase/useSession";
import type { ArcadeProductId } from "./store";

interface ArcadeStatusPayload {
  available: boolean;
  gamePass: boolean;
  questionSkips: number;
}

interface StoredArcadeStatus extends ArcadeStatusPayload {
  subjectKey: string | null;
}

const EMPTY_STATUS: StoredArcadeStatus = {
  subjectKey: null,
  available: false,
  gamePass: false,
  questionSkips: 0,
};

/** Rejects lookalike or credentialed redirects before leaving BibleQuest. */
async function checkoutUrl(response: Response): Promise<string | null> {
  const payload = (await response.json()) as { url?: unknown };
  if (typeof payload.url !== "string") return null;
  try {
    const destination = new URL(payload.url);
    if (
      destination.origin !== "https://checkout.stripe.com" ||
      destination.username ||
      destination.password
    ) {
      return null;
    }
    return destination.toString();
  } catch {
    return null;
  }
}

/** Coordinates the server-authoritative arcade products for one signed-in user. */
export function useArcadeAccess() {
  const session = useSession();
  const [status, setStatus] = useState<StoredArcadeStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (session.loading || !session.user) return;
    try {
      const response = await authenticatedApiFetch(
        session.user.id,
        "/api/arcade/status",
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("status");
      const payload = (await response.json()) as ArcadeStatusPayload;
      if (
        typeof payload.available !== "boolean" ||
        typeof payload.gamePass !== "boolean" ||
        !Number.isInteger(payload.questionSkips) ||
        payload.questionSkips < 0
      ) {
        throw new Error("status");
      }
      setStatus({ ...payload, subjectKey: session.user.id });
      setError(null);
    } catch {
      setError("Arcade purchases couldn’t be refreshed just now.");
    } finally {
      setLoading(false);
    }
  }, [session.loading, session.user]);

  useEffect(() => {
    if (session.loading || !session.user) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, session.loading, session.user]);

  const startCheckout = useCallback(
    async (product: ArcadeProductId) => {
      if (!webCommerceAvailable() || !session.user) return false;
      try {
        const response = await authenticatedApiFetch(
          session.user.id,
          "/api/arcade/checkout",
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product }),
          },
        );
        const destination = response.ok ? await checkoutUrl(response) : null;
        if (!destination) return false;
        window.location.assign(destination);
        return true;
      } catch {
        return false;
      }
    },
    [session.user],
  );

  const consumeQuestionSkip = useCallback(
    async (chapterId: string) => {
      if (!session.user) return false;
      try {
        const response = await authenticatedApiFetch(
          session.user.id,
          "/api/arcade/consume",
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chapterId }),
          },
        );
        if (!response.ok) return false;
        const payload = (await response.json()) as {
          consumed?: unknown;
          remaining?: unknown;
        };
        if (
          payload.consumed !== true ||
          !Number.isInteger(payload.remaining) ||
          Number(payload.remaining) < 0
        ) {
          return false;
        }
        setStatus((current) => ({
          ...current,
          questionSkips: Number(payload.remaining),
        }));
        return true;
      } catch {
        return false;
      }
    },
    [session.user],
  );

  const visible =
    status.subjectKey === session.user?.id ? status : EMPTY_STATUS;

  return {
    ...visible,
    loading: session.loading || (Boolean(session.user) && loading),
    signedIn: Boolean(session.user),
    error,
    refresh,
    startCheckout,
    consumeQuestionSkip,
  };
}
