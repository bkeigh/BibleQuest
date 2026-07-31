"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/platform/api";

const DEVICE_KEY = "biblequest:scripture-device";
const SESSION_KEY = "biblequest:scripture-session";
const MAX_ATTEMPTS = 3;

function anonymousId(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  storage.setItem(key, value);
  return value;
}

/** Reports only provider-supplied views required by API.Bible's FUMS terms. */
export function ApiBibleViewTracker({ token }: { token?: string }) {
  // De-duplicate React effect replays for this rendered instance only. A new
  // mount is a new display and must produce another FUMS view report.
  const attemptedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token || token.length > 2_000 || attemptedToken.current === token) return;
    attemptedToken.current = token;
    let deviceId: string;
    let sessionId: string;
    try {
      deviceId = anonymousId(window.localStorage, DEVICE_KEY);
      sessionId = anonymousId(window.sessionStorage, SESSION_KEY);
    } catch {
      deviceId = crypto.randomUUID();
      sessionId = crypto.randomUUID();
    }
    const body = JSON.stringify({ token, deviceId, sessionId });
    void (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          const response = await apiFetch("/api/bible/view", {
            method: "POST",
            cache: "no-store",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body,
          });
          if (response.ok) return;
          // Bad input cannot improve with time; 429/5xx can.
          if (response.status < 500 && response.status !== 429) break;
        } catch {
          // A transient network failure gets the same bounded retry below.
        }
        if (attempt + 1 < MAX_ATTEMPTS) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, 500 * 2 ** attempt),
          );
        }
      }
      // Permit a later effect replay/token revisit to try again after the
      // bounded attempt set failed.
      if (attemptedToken.current === token) attemptedToken.current = null;
    })();
  }, [token]);

  return null;
}
