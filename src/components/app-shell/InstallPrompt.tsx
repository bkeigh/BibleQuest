"use client";

/**
 * Install guidance. On Android/desktop it uses the native
 * beforeinstallprompt; on iOS Safari (which has no such event) it shows
 * Add-to-Home-Screen instructions after a short delay. Never nags:
 * dismissed once, gone.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconClose, IconShare } from "@/components/design-system/icons";
import { gentleEase } from "@/lib/motion";
import { track } from "@/lib/analytics/events";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const DISMISS_KEY = "biblequest:install-dismissed";

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS
      (window.navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
      track("pwa_install_prompt_viewed");
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS gets a delayed hint (no install event to wait for).
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (ios) {
      iosTimer = setTimeout(() => {
        setIsIOS(true);
        setShow(true);
        track("pwa_install_prompt_viewed");
      }, 12000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.4, ease: gentleEase }}
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-[var(--radius-card-lg)] border border-mist bg-paper p-4 paper-shadow-lg sm:bottom-6"
        >
          <div className="flex items-start gap-3">
            <PixelIcon name="chapel" size={5} />
            <div className="min-w-0 flex-1">
              <p className="text-[1rem] text-graphite">
                Use BibleQuest like an app
              </p>
              {isIOS ? (
                <p className="mt-1 text-[0.875rem] leading-relaxed text-ash">
                  Tap <IconShare size={15} className="inline align-text-bottom" />{" "}
                  Share, then <span className="text-charcoal">Add to Home Screen</span>.
                  It opens full screen, one tap away.
                </p>
              ) : (
                <p className="mt-1 text-[0.875rem] leading-relaxed text-ash">
                  Add it to your home screen and it opens in one tap.
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                {!isIOS && (
                  <GentleButton variant="primary" size="sm" onClick={install}>
                    Add to home screen
                  </GentleButton>
                )}
                <GentleButton variant="ghost" size="sm" onClick={dismiss}>
                  Not now
                </GentleButton>
              </div>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="text-ash hover:text-charcoal"
            >
              <IconClose size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
