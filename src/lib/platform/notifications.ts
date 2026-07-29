import {
  PlatformConfigurationError,
  platformRuntime,
  type PlatformRuntime,
} from "./runtime";

export type NotificationPosture =
  | { supported: true; iosHomeScreenRequired: false }
  | { supported: false; iosHomeScreenRequired: boolean };

export interface NotificationCapabilityAdapter {
  channel: "web-push" | "native";
  posture: () => NotificationPosture;
  permission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
}

/** Implements browser support, permission, and iOS Home Screen detection only. */
export function webNotificationCapability(): NotificationCapabilityAdapter {
  return {
    channel: "web-push",
    posture: webNotificationPosture,
    permission: () =>
      typeof Notification === "undefined" ? "default" : Notification.permission,
    requestPermission: async () => {
      if (typeof Notification === "undefined") return "denied";
      return Notification.requestPermission();
    },
  };
}

/** Selects a future native adapter only for a native build and otherwise fails closed. */
export function notificationCapability(
  options: {
    runtime?: PlatformRuntime;
    native?: NotificationCapabilityAdapter;
  } = {},
): NotificationCapabilityAdapter {
  const runtime = options.runtime ?? platformRuntime();
  if (runtime.target === "web") return webNotificationCapability();
  if (options.native?.channel === "native") return options.native;
  return unavailableNativeNotificationCapability();
}

/** Detects browser support without causing the permission prompt. */
function webNotificationPosture(): NotificationPosture {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, iosHomeScreenRequired: false };
  }
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (ios && !standalone) {
    return { supported: false, iosHomeScreenRequired: true };
  }
  return {
    supported:
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    iosHomeScreenRequired: false,
  };
}

/** Prevents a native-target build from silently falling back to browser push. */
function unavailableNativeNotificationCapability(): NotificationCapabilityAdapter {
  return {
    channel: "native",
    posture: () => ({ supported: false, iosHomeScreenRequired: false }),
    permission: () => "default",
    requestPermission: async () => {
      throw new PlatformConfigurationError();
    },
  };
}
