"use client";

import { useEffect } from "react";
import {
  isSafeServiceWorkerVersion,
  reportClientSignal,
} from "@/lib/observability/client-signals";

const VERSION_TIMEOUT_MS = 10_000;

/** Registers the worker and reports only its bounded active-version posture. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let reported = false;
    let versionTimer: number | null = null;
    const reportOnce = (
      outcome: "success" | "failure",
      version?: string,
    ) => {
      if (reported) return;
      reported = true;
      if (versionTimer) window.clearTimeout(versionTimer);
      reportClientSignal({
        surface: "service_worker",
        stage: "registration",
        outcome,
        category: outcome === "success" ? "ok" : "worker",
        ...(version ? { service_worker_version: version } : {}),
      });
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        (data as { type?: unknown }).type !==
          "BIBLEQUEST_SW_VERSION_RESPONSE"
      ) {
        return;
      }
      const version = (data as { version?: unknown }).version;
      if (isSafeServiceWorkerVersion(version)) {
        reportOnce("success", version);
      } else {
        reportOnce("failure");
      }
    };
    const onLoad = () => {
      versionTimer = window.setTimeout(
        () => reportOnce("failure"),
        VERSION_TIMEOUT_MS,
      );
      void navigator.serviceWorker
        .register("/sw.js")
        .then(async () => {
          const registration = await navigator.serviceWorker.ready;
          registration.active?.postMessage({
            type: "BIBLEQUEST_SW_VERSION_REQUEST",
          });
        })
        .catch(() => reportOnce("failure"));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      if (versionTimer) window.clearTimeout(versionTimer);
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
