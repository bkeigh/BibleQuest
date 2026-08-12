import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  checkoutReturnHintFromUrl,
  createCheckoutReturnRefreshController,
  legacyWebCheckoutReturnHint,
  publishCheckoutReturnUrl,
  subscribeToCheckoutReturns,
  type BillingProjectionResult,
  type CheckoutReturnState,
} from "@/lib/billing/checkout-return";

interface HarnessOptions {
  projections?: BillingProjectionResult[];
  online?: boolean;
  refresh?: "completed" | "deferred" | "failed";
}

/** Builds a zero-delay controller while retaining the production retry count. */
function harness(options: HarnessOptions = {}) {
  const states: CheckoutReturnState[] = [];
  const projections = [...(options.projections ?? ["free"])];
  let online = options.online ?? true;
  const refresh = vi.fn(async () => options.refresh ?? "completed" as const);
  const status = vi.fn(async () => projections.shift() ?? "free");
  const controller = createCheckoutReturnRefreshController({
    refresh,
    status,
    isOnline: () => online,
    onState: (state) => states.push(state),
    retryDelaysMs: [0, 1, 1, 1],
    wait: async () => undefined,
  });
  return {
    controller,
    states,
    refresh,
    status,
    setOnline: (value: boolean) => {
      online = value;
    },
  };
}

describe("Plus reconciliation after a Checkout return", () => {
  it("confirms Plus only after the authenticated status projection does", async () => {
    const run = harness({ projections: ["plus"] });

    expect(run.controller.begin("returned", "user:account-a")).toBe(true);
    await run.controller.settled();

    expect(run.refresh).toHaveBeenCalledOnce();
    expect(run.status).toHaveBeenCalledOnce();
    expect(run.states.at(-1)).toEqual({
      hint: "returned",
      phase: "confirmed",
      attempt: 1,
    });
  });

  it("shows cancellation without calling refresh or status", async () => {
    const run = harness({ projections: ["plus"] });

    expect(run.controller.begin("cancelled", "user:account-a")).toBe(true);
    await run.controller.settled();

    expect(run.refresh).not.toHaveBeenCalled();
    expect(run.status).not.toHaveBeenCalled();
    expect(run.states.at(-1)?.phase).toBe("cancelled");
  });

  it("waits through bounded webhook lag before accepting the projection", async () => {
    const run = harness({ projections: ["free", "free", "plus"] });

    run.controller.begin("returned", "user:account-a");
    await run.controller.settled();

    expect(run.status).toHaveBeenCalledTimes(3);
    expect(run.states.filter((state) => state.phase === "waiting")).toHaveLength(
      2,
    );
    expect(run.states.at(-1)?.phase).toBe("confirmed");
  });

  it("times out after four free projections and leaves manual retry available", async () => {
    const run = harness({
      projections: ["free", "free", "free", "free"],
    });

    run.controller.begin("returned", "user:account-a");
    await run.controller.settled();

    expect(run.status).toHaveBeenCalledTimes(4);
    expect(run.states.at(-1)).toEqual({
      hint: "returned",
      phase: "timed-out",
      attempt: 4,
    });
  });

  it("aborts a never-settling refresh at the overall deadline", async () => {
    vi.useFakeTimers();
    const states: CheckoutReturnState[] = [];
    const controller = createCheckoutReturnRefreshController({
      refresh: (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
      status: async () => "free",
      isOnline: () => true,
      onState: (state) => states.push(state),
      timeoutMs: 50,
      retryDelaysMs: [0],
    });

    controller.begin("returned", "user:account-a");
    const settled = controller.settled();
    await vi.advanceTimersByTimeAsync(50);
    await settled;
    vi.useRealTimers();

    expect(states.at(-1)?.phase).toBe("timed-out");
  });

  it("recovers once from offline state without accepting duplicate resumes", async () => {
    const run = harness({ online: false, projections: ["plus"] });

    run.controller.begin("returned", "user:account-a");
    await run.controller.settled();
    expect(run.states.at(-1)?.phase).toBe("offline");
    expect(run.refresh).not.toHaveBeenCalled();

    run.setOnline(true);
    expect(run.controller.resume("user:account-a")).toBe(true);
    expect(run.controller.resume("user:account-a")).toBe(true);
    await run.controller.settled();

    expect(run.refresh).toHaveBeenCalledOnce();
    expect(run.states.at(-1)?.phase).toBe("confirmed");
  });

  it("deduplicates return events while one account reconciliation is active", async () => {
    let resolveStatus: ((value: BillingProjectionResult) => void) | undefined;
    const status = vi.fn(
      () =>
        new Promise<BillingProjectionResult>((resolve) => {
          resolveStatus = resolve;
        }),
    );
    const controller = createCheckoutReturnRefreshController({
      refresh: async () => "completed",
      status,
      isOnline: () => true,
      onState: () => undefined,
      retryDelaysMs: [0],
    });

    expect(controller.begin("returned", "user:account-a")).toBe(true);
    await vi.waitFor(() => expect(status).toHaveBeenCalledOnce());
    expect(controller.begin("returned", "user:account-a")).toBe(false);
    resolveStatus?.("plus");
    await controller.settled();

    expect(status).toHaveBeenCalledOnce();
  });

  it("isolates account switches and ignores the late account A response", async () => {
    let resolveAccountA:
      | ((value: BillingProjectionResult) => void)
      | undefined;
    const states: CheckoutReturnState[] = [];
    const status = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<BillingProjectionResult>((resolve) => {
            resolveAccountA = resolve;
          }),
      )
      .mockResolvedValueOnce("plus");
    const controller = createCheckoutReturnRefreshController({
      refresh: async () => "completed",
      status,
      isOnline: () => true,
      onState: (state) => states.push(state),
      retryDelaysMs: [0],
    });

    controller.begin("returned", "user:account-a");
    await vi.waitFor(() => expect(status).toHaveBeenCalledOnce());
    const accountASettled = controller.settled();
    controller.reset();
    controller.begin("returned", "user:account-b");
    await controller.settled();
    const stateCount = states.length;

    resolveAccountA?.("plus");
    await accountASettled;

    expect(states).toHaveLength(stateCount);
    expect(states.filter((state) => state.phase === "confirmed")).toHaveLength(
      1,
    );
  });

  it("ignores stale responses after disposal", async () => {
    let resolveStatus: ((value: BillingProjectionResult) => void) | undefined;
    const states: CheckoutReturnState[] = [];
    const controller = createCheckoutReturnRefreshController({
      refresh: async () => "completed",
      status: () =>
        new Promise<BillingProjectionResult>((resolve) => {
          resolveStatus = resolve;
        }),
      isOnline: () => true,
      onState: (state) => states.push(state),
      retryDelaysMs: [0],
    });

    controller.begin("returned", "user:account-a");
    await vi.waitFor(() => expect(resolveStatus).toBeTypeOf("function"));
    const settled = controller.settled();
    controller.dispose();
    const stateCount = states.length;
    resolveStatus?.("plus");
    await settled;

    expect(states).toHaveLength(stateCount);
    expect(states.at(-1)?.phase).toBe("checking");
  });

  it("aborts immediately in the background and ignores the pending response", async () => {
    let resolveStatus: ((value: BillingProjectionResult) => void) | undefined;
    const states: CheckoutReturnState[] = [];
    const controller = createCheckoutReturnRefreshController({
      refresh: async () => "completed",
      status: () =>
        new Promise<BillingProjectionResult>((resolve) => {
          resolveStatus = resolve;
        }),
      isOnline: () => true,
      onState: (state) => states.push(state),
      retryDelaysMs: [0],
    });

    controller.begin("returned", "user:account-a");
    await vi.waitFor(() => expect(resolveStatus).toBeTypeOf("function"));
    const settled = controller.settled();
    controller.pause();
    const stateCount = states.length;
    resolveStatus?.("plus");
    await settled;

    expect(states).toHaveLength(stateCount);
    expect(states.at(-1)?.phase).toBe("paused");
  });

  it("reports provider or status failure without changing entitlement", async () => {
    const run = harness({
      refresh: "failed",
      projections: ["failed", "failed", "failed", "failed"],
    });

    run.controller.begin("returned", "user:account-a");
    await run.controller.settled();

    expect(run.states.at(-1)?.phase).toBe("failed");
  });
});

describe("Checkout return URL boundary", () => {
  it.each([
    ["https://www.biblequest.co/checkout/plus/returned", "returned"],
    ["https://www.biblequest.co/checkout/plus/cancelled", "cancelled"],
    ["biblequest://billing/checkout/returned", "returned"],
    ["biblequest://billing/checkout/cancelled", "cancelled"],
  ])("accepts the exact fixed route %s", (url, hint) => {
    expect(checkoutReturnHintFromUrl(url)).toBe(hint);
  });

  it.each([
    "http://www.biblequest.co/checkout/plus/returned",
    "https://biblequest.co/checkout/plus/returned",
    "https://www.biblequest.co.evil.test/checkout/plus/returned",
    "https://www.biblequest.co/checkout/plus/returned/extra",
    "https://www.biblequest.co/checkout/plus/returned?user=account-a",
    "https://www.biblequest.co/checkout/plus/returned#plus",
    "https://user@www.biblequest.co/checkout/plus/returned",
    "https://www.biblequest.co:443/checkout/plus/returned",
    "HTTPS://www.biblequest.co/checkout/plus/returned",
    "biblequest://auth/callback",
    "biblequest://billing/checkout/returned?token=secret",
    "biblequest://billing/checkout/returned#plus",
    "javascript:alert(1)",
    "not a URL",
  ])("rejects malicious or decorated return URL %s", (url) => {
    expect(checkoutReturnHintFromUrl(url)).toBeNull();
  });

  it("keeps the legacy web query exact and display-only", () => {
    expect(
      legacyWebCheckoutReturnHint(
        "https://www.biblequest.co/app/plus?checkout=returned",
      ),
    ).toBe("returned");
    expect(
      legacyWebCheckoutReturnHint(
        "https://www.biblequest.co/app/plus?checkout=returned&user=a",
      ),
    ).toBeNull();
    expect(
      legacyWebCheckoutReturnHint(
        "https://www.biblequest.co/app/account?checkout=returned",
      ),
    ).toBeNull();
    expect(
      legacyWebCheckoutReturnHint(
        "https://evil.test/app/plus?checkout=returned",
      ),
    ).toBeNull();
  });

  it("publishes only validated external-navigation URLs", () => {
    const hints: string[] = [];
    const unsubscribe = subscribeToCheckoutReturns(({ hint }) => {
      hints.push(hint);
    });

    expect(
      publishCheckoutReturnUrl(
        "https://www.biblequest.co/checkout/plus/returned?isPlus=true",
      ),
    ).toBe(false);
    expect(
      publishCheckoutReturnUrl(
        "https://www.biblequest.co/checkout/plus/returned",
      ),
    ).toBe(true);
    unsubscribe();

    expect(hints).toEqual(["returned"]);
  });
});

describe("hosted Checkout return destinations", () => {
  it("exposes only exact universal-link paths with no query contract", () => {
    const association = JSON.parse(
      readFileSync("public/.well-known/apple-app-site-association", "utf8"),
    ) as {
      applinks: { details: Array<{ appIDs: string[]; components: object[] }> };
    };
    const hosted = readFileSync(
      "src/components/marketing/HostedCheckoutReturn.tsx",
      "utf8",
    );
    const nativeBuilder = readFileSync("scripts/build-native.mjs", "utf8");

    expect(association.applinks.details).toEqual([
      {
        appIDs: ["W8KU6X34XR.co.biblequest.app"],
        components: [
          { "/": "/checkout/plus/returned" },
          { "/": "/checkout/plus/cancelled" },
        ],
      },
    ]);
    expect(hosted).not.toMatch(/token|userId|customerId|isPlus/);
    expect(hosted).toContain("does not confirm payment or Plus");
    expect(hosted).toContain("No membership change is assumed");
    expect(nativeBuilder).toContain(
      '"--exclude=/public/.well-known/apple-app-site-association"',
    );
  });

  it("wires accepted iOS links into the bounded refresh controller", () => {
    const entitlements = readFileSync("ios/App/App/App.entitlements", "utf8");
    const plist = readFileSync("ios/App/App/Info.plist", "utf8");
    const scene = readFileSync("ios/App/App/SceneDelegate.swift", "utf8");
    const plugin = readFileSync(
      "ios/App/App/BibleQuestCommercePlugin.swift",
      "utf8",
    );
    const bridge = readFileSync(
      "src/lib/platform/native-app-to-web.ts",
      "utf8",
    );
    const coordinator = readFileSync("src/lib/billing/usePlus.ts", "utf8");

    expect(entitlements).toContain("applinks:www.biblequest.co");
    expect(plist).toContain("CFBundleURLSchemes");
    expect(plist).toContain("<string>biblequest</string>");
    expect(scene).toContain("BibleQuestCheckoutReturnRouter.shared.accept");
    expect(plugin).toContain('notifyListeners("checkoutReturn"');
    expect(bridge).toContain("observeNativeCheckoutReturns");
    expect(coordinator).toContain("publishCheckoutReturnUrl(url)");
  });

  it("polls status without copying plan acquisition into the retry loop", () => {
    const coordinator = readFileSync("src/lib/billing/usePlus.ts", "utf8");
    const statusReader = coordinator.slice(
      coordinator.indexOf("const requestBillingStatus"),
      coordinator.indexOf("const refresh", coordinator.indexOf("const requestBillingStatus")),
    );

    expect(coordinator).toContain("status: requestBillingStatus");
    expect(statusReader).toContain('"/api/billing/status"');
    expect(statusReader).not.toContain("/api/billing/plans");
    expect(statusReader).not.toContain("isPlus: true");
  });
});
