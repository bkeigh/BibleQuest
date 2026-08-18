"use client";

export const SIGN_IN_TRACKING_STAMP_KEY = "biblequest:signin-tracked";
const SIGN_IN_TRACKING_WINDOW_MS = 15_000;

/** Claims one short-lived cross-tab analytics event without auth authority. */
export function firstTabToTrackSignIn(): boolean {
  try {
    const raw = window.localStorage.getItem(SIGN_IN_TRACKING_STAMP_KEY);
    if (raw) {
      if (Date.now() - Number(raw) < SIGN_IN_TRACKING_WINDOW_MS) {
        return false;
      }
      window.localStorage.removeItem(SIGN_IN_TRACKING_STAMP_KEY);
    }
    window.localStorage.setItem(
      SIGN_IN_TRACKING_STAMP_KEY,
      String(Date.now()),
    );
    return true;
  } catch {
    return true;
  }
}

/** Removes the content-free analytics stamp during terminal device cleanup. */
export function clearSignInTrackingStamp(): boolean {
  try {
    window.localStorage.removeItem(SIGN_IN_TRACKING_STAMP_KEY);
    return window.localStorage.getItem(SIGN_IN_TRACKING_STAMP_KEY) === null;
  } catch {
    return false;
  }
}
