import { describe, expect, it, vi } from "vitest";
import {
  accountLifecycleHandleIsCurrent,
  accountLifecycleIsActive,
  beginAccountLifecycle,
  finishAccountLifecycle,
  requireAccountLifecycleIdle,
  subscribeAccountLifecycle,
} from "@/lib/auth/account-lifecycle";

describe("device-wide account lifecycle", () => {
  it("allows only one account mutation and invalidates stale idle captures", () => {
    const idle = requireAccountLifecycleIdle();
    const accountA = beginAccountLifecycle("account-a");

    expect(accountA).not.toBeNull();
    expect(accountLifecycleIsActive()).toBe(true);
    expect(beginAccountLifecycle("account-b")).toBeNull();
    expect(() => requireAccountLifecycleIdle(idle)).toThrow();

    finishAccountLifecycle(accountA!);
    expect(accountLifecycleIsActive()).toBe(false);
    expect(accountLifecycleHandleIsCurrent(accountA!)).toBe(false);
  });

  it("publishes both acquisition and release without accepting stale release", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAccountLifecycle(listener);
    const accountA = beginAccountLifecycle("account-a")!;
    finishAccountLifecycle({ token: accountA.token + 1, userId: "account-a" });
    expect(accountLifecycleIsActive()).toBe(true);
    finishAccountLifecycle(accountA);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
