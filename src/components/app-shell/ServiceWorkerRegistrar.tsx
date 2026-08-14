"use client";

import { useEffect } from "react";
import {
  isSafeServiceWorkerVersion,
  reportClientSignal,
} from "@/lib/observability/client-signals";
import { isNativeTarget } from "@/lib/platform/target";
import {
  installWebAuthServiceWorkerResponder,
  prepareWebAuthServiceWorker,
} from "@/lib/platform/web-auth-service-worker";

const VERSION_TIMEOUT_MS = 10_000;

/** Registers the worker and reports only its bounded active-version posture. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      isNativeTarget() ||
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) ||
      window.location.hostname === "console.biblequest.co" ||
      window.location.pathname.startsWith("/console")
    ) {
      return;
    }

    let reported = false;
    let versionTimer: number | null = null;
    let observedRegistration: ServiceWorkerRegistration | null = null;
    let observedInstallingWorker: ServiceWorker | null = null;
    const removeWebAuthResponder = installWebAuthServiceWorkerResponder();
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

    // Challenge each newly controlling worker so an old active worker cannot
    // turn a normal v14 -> v15 upgrade into a false registration failure.
    const challengeWorker = (worker?: ServiceWorker | null) => {
      worker?.postMessage({ type: "BIBLEQUEST_SW_VERSION_REQUEST" });
    };
    const onControllerChange = () => {
      challengeWorker(navigator.serviceWorker.controller);
    };
    const onInstallingStateChange = () => {
      if (observedInstallingWorker?.state === "activated") {
        challengeWorker(
          navigator.serviceWorker.controller ?? observedRegistration?.active,
        );
      }
    };
    const observeInstallingWorker = (registration: ServiceWorkerRegistration) => {
      if (observedInstallingWorker) {
        observedInstallingWorker.removeEventListener(
          "statechange",
          onInstallingStateChange,
        );
      }
      observedInstallingWorker = registration.installing;
      observedInstallingWorker?.addEventListener(
        "statechange",
        onInstallingStateChange,
      );
    };
    const onUpdateFound = () => {
      if (observedRegistration) observeInstallingWorker(observedRegistration);
    };
    const onLoad = () => {
      versionTimer = window.setTimeout(
        () => reportOnce("failure"),
        VERSION_TIMEOUT_MS,
      );
      void prepareWebAuthServiceWorker()
        .then(async (registration) => {
          observedRegistration = registration;
          registration.addEventListener("updatefound", onUpdateFound);
          observeInstallingWorker(registration);
          const readyRegistration = await navigator.serviceWorker.ready;
          challengeWorker(readyRegistration.active);
        })
        .catch(() => reportOnce("failure"));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      if (versionTimer) window.clearTimeout(versionTimer);
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      observedRegistration?.removeEventListener("updatefound", onUpdateFound);
      observedInstallingWorker?.removeEventListener(
        "statechange",
        onInstallingStateChange,
      );
      removeWebAuthResponder();
    };
  }, []);
  return null;
}
