import { describe, expect, it, vi } from "vitest";
import {
  applicationServerKey,
  pushClientPosture,
} from "@/lib/push/client";

describe("push client posture", () => {
  it("decodes the browser-safe VAPID public key", () => {
    vi.stubGlobal(
      "atob",
      (value: string) => Buffer.from(value, "base64").toString("binary"),
    );
    const key = applicationServerKey("A".repeat(87));
    expect(key).toHaveLength(65);
  });

  it("requires Home Screen installation for ordinary iOS browser tabs", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    vi.stubGlobal("window", {
      isSecureContext: true,
      matchMedia: () => ({ matches: false }),
      PushManager: class {},
      Notification: class {},
    });

    expect(pushClientPosture()).toEqual({
      supported: false,
      iosHomeScreenRequired: true,
    });
  });

  it("never requests permission while detecting support", () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("navigator", {
      userAgent: "Chrome",
      platform: "MacIntel",
      maxTouchPoints: 0,
      serviceWorker: {},
    });
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", { requestPermission });
    vi.stubGlobal("window", {
      isSecureContext: true,
      matchMedia: () => ({ matches: false }),
      PushManager: class {},
      Notification: { requestPermission },
    });

    expect(pushClientPosture().supported).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
