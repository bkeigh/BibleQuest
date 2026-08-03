"use client";

/**
 * Install guidance. Uses the native install prompt when available and gives
 * platform-specific manual steps everywhere else after a short delay.
 */
import { useEffect, useRef, useState } from "react";
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

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

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

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDismissed()) return;

    if (isStandaloneWebApp()) return;

    // Reveals at most once per mount so fallback and native events cannot
    // double-count the same prompt impression.
    const reveal = () => {
      if (shownRef.current || dismissedRef.current || isDismissed()) return;
      shownRef.current = true;
      setShow(true);
      track("pwa_install_prompt_viewed");
    };

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      reveal();
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // Every browser gets useful manual steps if no native event arrives.
    const fallbackTimer = setTimeout(() => {
      reveal();
    }, 12000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!show || !panel) {
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
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(
        "--app-install-prompt-height",
      );
    };
  }, [show, deferred]);

  function dismiss() {
    dismissedRef.current = true;
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
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
      setDeferred(null);
      dismiss();
    } catch {
      // A consumed or browser-cancelled event should fall back to directions.
      setDeferred(null);
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.4, ease: gentleEase }}
          className="app-glass-surface fixed inset-x-4 bottom-[calc(var(--app-bottom-nav-height,5rem)+1rem)] z-40 mx-auto max-w-md rounded-[var(--radius-card-lg)] border border-mist bg-paper p-4 paper-shadow-lg"
        >
          <div className="flex items-start gap-3">
            <ArtIcon name="chapel" size={80} />
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
              <div className="mt-3 flex flex-col items-stretch gap-2 min-[360px]:flex-row min-[360px]:items-center">
                {deferred && (
                  <GentleButton
                    variant="primary"
                    size="sm"
                    onClick={install}
                    className="w-full min-[360px]:w-auto"
                  >
                    Add to home screen
                  </GentleButton>
                )}
                <GentleButton
                  variant="ghost"
                  size="sm"
                  onClick={dismiss}
                  className="w-full min-[360px]:w-auto"
                >
                  Not now
                </GentleButton>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ash transition-colors hover:bg-linen hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconClose size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
