/**
 * Temporary pre-launch UX gate.
 *
 * The password is intentionally client-visible: this is a friendly preview
 * barrier, not authentication or access control. Remove this module together
 * with WaitlistGate when BibleQuest launches publicly.
 */
export const PREVIEW_GATE_PASSWORD = "biblequest123";
export const PREVIEW_GATE_SESSION_KEY = "biblequest:preview-home:v1";
export const PREVIEW_GATE_SESSION_VALUE = "granted";

export const TALLY_WAITLIST_URL = "https://tally.so/r/J9xpP4";
export const TALLY_WAITLIST_EMBED_URL =
  "https://tally.so/embed/J9xpP4?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1";
export const TALLY_WAITLIST_SCRIPT_URL = "https://tally.so/widgets/embed.js";

export function isPreviewPasswordAccepted(candidate: string): boolean {
  return candidate.trim() === PREVIEW_GATE_PASSWORD;
}

export function isPreviewGatePath(pathname: string): boolean {
  return pathname === "/";
}
