"use client";

/**
 * Install guidance. Uses the native install prompt when available and gives
 * platform-specific manual steps everywhere else after a short delay.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconClose } from "@/components/design-system/icons";
import { gentleEase } from "@/lib/motion";
import { track } from "@/lib/analytics/events";
import {
  detectInstallPlatform,
  installDirections,
  installDismissalIsActive,
  isStandaloneWebApp,
  type InstallPlatform,
} from "@/lib/pwa/install-guidance";
import { isNativeTarget } from "@/lib/platform/target";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  subscribeDeferredInstallPrompt,
} from "@/lib/pwa/install-event";

const DISMISS_KEY = "biblequest:install-dismissed";

/** True once the user has dismissed the prompt in this browser. Wrapped so a
 *  throwing localStorage (Safari private mode) degrades to "not dismissed"
 *  rather than crashing the shell. */
function isDismissed(): boolean {
  try {
    return installDismissalIsActive(
      window.localStorage.getItem(DISMISS_KEY),
    );
  } catch {
    return false;
  }
}

export function InstallPrompt({
  eligible,
  onVisibilityChange,
}: {
  eligible: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const [show, setShow] = useState(false);
  const deferred = useSyncExternalStore(
    subscribeDeferredInstallPrompt,
    getDeferredInstallPrompt,
    getDeferredInstallPrompt,
  );
  const [platform] = useState<InstallPlatform>(() =>
    typeof navigator === "undefined"
      ? "other"
      : detectInstallPlatform(navigator),
  );
  // This component lives in the persistent /app layout and never unmounts on
  // soft navigation. Chrome, however, re-dispatches `beforeinstallprompt` on
  // later navigations while the app is still uninstalled — so the mount-time
  // localStorage guard alone can't keep a dismissed prompt down. This ref is
  // the in-session latch the re-fire path checks, so "Not now" actually sticks.
  const dismissedRef = useRef(false);
  const shownRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const eligibleRef = useRef(eligible);
  const offerReadyRef = useRef(false);
  const visible = eligible && show;

  // Keeps the browser-event listener current without tearing it down on state changes.
  useEffect(() => {
    eligibleRef.current = eligible;
  }, [eligible]);

  // Reveals once, and only after the reader has completed a daily loop.
  const reveal = useCallback(() => {
    if (
      !eligibleRef.current ||
      !offerReadyRef.current ||
      shownRef.current ||
      dismissedRef.current ||
      isDismissed()
    ) {
      return;
    }
    shownRef.current = true;
    setShow(true);
    track("pwa_install_prompt_viewed");
  }, []);

  // Lets the persistent shell suppress other launchers while this panel is open.
  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [onVisibilityChange, visible]);

  // Releases the shared overlay slot if the prompt leaves with the shell.
  useEffect(() => {
    return () => {
      onVisibilityChange?.(false);
    };
  }, [onVisibilityChange]);

  useEffect(() => {
    if (!deferred) return;
    reveal();
  }, [deferred, reveal]);

  useEffect(() => {
    if (!eligible) {
      offerReadyRef.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    // The native app IS the installed app. `isStandaloneWebApp()` only reads
    // display-mode and navigator.standalone, neither of which a Capacitor
    // WebView sets, so without this the fallback timer below would show
    // "Tap Share, then Add to Home Screen" inside the iOS app.
    if (isDismissed() || isNativeTarget() || isStandaloneWebApp()) return;

    // Every browser gets useful manual steps after a post-value pause. A
    // Chromium event captured earlier remains available to the revealed panel.
    const fallbackTimer = window.setTimeout(() => {
      offerReadyRef.current = true;
      reveal();
    }, 12000);
    return () => window.clearTimeout(fallbackTimer);
  }, [eligible, reveal]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!visible || !panel) {
      document.documentElement.style.removeProperty(
        "--app-install-prompt-height",
      );
      return;
    }

    // Reserve the panel plus its 16px nav gap so the next popup stacks cleanly.
    const publishHeight = () => {
      document.documentElement.style.setProperty(
        "--app-install-prompt-height",
        `${panel.getBoundingClientRect().height + 16}px`,
      );
      window.dispatchEvent(new Event("biblequest:app-overlay-layout"));
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(
        "--app-install-prompt-height",
      );
      window.dispatchEvent(new Event("biblequest:app-overlay-layout"));
    };
  }, [visible, deferred]);

  function dismiss() {
    dismissedRef.current = true;
    setShow(false);
    clearDeferredInstallPrompt(deferred);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage can be unavailable (Safari private mode); the in-session latch
      // above still keeps the dismissed prompt down for this visit.
    }
  }

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      track(
        outcome === "accepted"
          ? "pwa_install_accepted"
          : "pwa_install_dismissed",
      );
      clearDeferredInstallPrompt(deferred);
      dismiss();
    } catch {
      // A consumed or browser-cancelled event should fall back to directions.
      clearDeferredInstallPrompt(deferred);
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.4, ease: gentleEase }}
          className="fixed inset-x-4 bottom-[calc(var(--app-bottom-nav-height,5rem)+1rem)] z-40 isolate mx-auto max-w-md rounded-[var(--radius-card-lg)] border border-gold-500/30 bg-paper p-4 paper-shadow-lg ring-1 ring-white/40"
        >
          <div className="flex items-start gap-3 pe-10">
            <ArtIcon name="chapel" size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-[1rem] text-graphite">
                Use BibleQuest like an app
              </p>
              {deferred ? (
                <p className="mt-1 text-[0.875rem] leading-relaxed text-ash">
                  Add it to your home screen and it opens in one tap.
                </p>
              ) : (
                <p className="mt-1 text-[0.875rem] leading-relaxed text-ash">
                  {installDirections(platform)} It then opens full screen, one
                  tap away.
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {deferred && (
              <GentleButton
                variant="primary"
                size="sm"
                onClick={install}
                className="min-w-0 flex-1"
              >
                Add to home screen
              </GentleButton>
            )}
            <GentleButton
              variant="ghost"
              size="sm"
              onClick={dismiss}
              className={deferred ? "shrink-0" : "w-full"}
            >
              Not now
            </GentleButton>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute end-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-ash transition-colors hover:bg-linen hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconClose size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
