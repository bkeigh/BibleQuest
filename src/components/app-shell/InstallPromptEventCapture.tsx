"use client";

import { useEffect } from "react";
import { isNativeTarget } from "@/lib/platform/target";
import {
  captureDeferredInstallPrompt,
  type DeferredInstallPromptEvent,
} from "@/lib/pwa/install-event";

/** Retains Chromium's one-shot install event across onboarding navigation. */
export function InstallPromptEventCapture() {
  useEffect(() => {
    if (isNativeTarget()) return;
    const capture = (event: Event) => {
      captureDeferredInstallPrompt(event as DeferredInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  return null;
}
