/** Browser install event retained across client-side route changes. */
export interface DeferredInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferredInstallPrompt: DeferredInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Captures Chromium's one-shot event before onboarding leaves its route. */
export function captureDeferredInstallPrompt(
  event: DeferredInstallPromptEvent,
): void {
  event.preventDefault();
  deferredInstallPrompt = event;
  listeners.forEach((listener) => listener());
}

/** Clears only the event a caller actually consumed or dismissed. */
export function clearDeferredInstallPrompt(
  expected: DeferredInstallPromptEvent | null = deferredInstallPrompt,
): void {
  if (deferredInstallPrompt !== expected) return;
  deferredInstallPrompt = null;
  listeners.forEach((listener) => listener());
}

/** Supplies React's stable external-store snapshot. */
export function getDeferredInstallPrompt(): DeferredInstallPromptEvent | null {
  return deferredInstallPrompt;
}

/** Notifies the post-value panel when the browser publishes or clears an event. */
export function subscribeDeferredInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
