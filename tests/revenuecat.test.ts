import { describe, expect, it, vi } from "vitest";
import type {
  CustomerInfo,
  Offering,
  Package,
  Purchases,
} from "@revenuecat/purchases-js";
import {
  REVENUECAT_ANONYMOUS_ID_KEY,
  RevenueCatClientManager,
  type IdentityPurchases,
  type RevenueCatSdkAdapter,
} from "@/lib/revenuecat/client";
import { parseRevenueCatConfiguration } from "@/lib/revenuecat/config";
import {
  presentCurrentPaywall,
  snapshotFromRevenueCat,
  statusFromSnapshot,
} from "@/lib/revenuecat/model";

class FakePurchases implements IdentityPurchases {
  readonly changedTo: string[] = [];
  readonly identifiedAs: string[] = [];

  constructor(private appUserId: string) {}

  getAppUserId() {
    return this.appUserId;
  }

  async changeUser(appUserId: string) {
    this.changedTo.push(appUserId);
    this.appUserId = appUserId;
  }

  async identifyUser(appUserId: string) {
    this.identifiedAs.push(appUserId);
    this.appUserId = appUserId;
  }
}

class FakeSdk implements RevenueCatSdkAdapter<FakePurchases> {
  configureCalls = 0;
  generated = 0;
  shared: FakePurchases | null = null;

  configure({ appUserId }: { apiKey: string; appUserId: string }) {
    this.configureCalls += 1;
    this.shared = new FakePurchases(appUserId);
    return this.shared;
  }

  getSharedInstance() {
    if (!this.shared) throw new Error("not configured");
    return this.shared;
  }

  isConfigured() {
    return this.shared !== null;
  }

  generateRevenueCatAnonymousAppUserId() {
    this.generated += 1;
    return `$RCAnonymousID:${String(this.generated).padStart(32, "0")}`;
  }
}

const fakePackage = {} as Package;

function offering(
  identifier: string,
  hasPaywall: boolean,
  packages: Package[] = [fakePackage],
): Offering {
  return {
    identifier,
    hasPaywall,
    availablePackages: packages,
  } as Offering;
}

function customerInfo(
  activeEntitlements: string[] = [],
  managementURL: string | null = null,
): CustomerInfo {
  return {
    entitlements: {
      active: Object.fromEntries(activeEntitlements.map((id) => [id, {}])),
      all: {},
    },
    managementURL,
  } as CustomerInfo;
}

describe("RevenueCat activation modes", () => {
  it("defaults to coming-soon and never activates from a key alone", () => {
    expect(parseRevenueCatConfiguration(undefined, undefined)).toMatchObject({
      status: "coming-soon",
      configured: false,
      apiKey: null,
    });
    expect(
      parseRevenueCatConfiguration(undefined, "test_publicfixture"),
    ).toMatchObject({ status: "coming-soon", configured: false, apiKey: null });
  });

  it("requires a matching documented public-key prefix", () => {
    expect(
      parseRevenueCatConfiguration("sandbox", "test_publicfixture"),
    ).toMatchObject({ status: "sandbox", configured: true });
    expect(
      parseRevenueCatConfiguration("live", "rcb_publicfixture"),
    ).toMatchObject({ status: "live", configured: true });
    expect(
      parseRevenueCatConfiguration("sandbox", "sk_secretfixture"),
    ).toMatchObject({ status: "invalid", configured: false, apiKey: null });
    expect(
      parseRevenueCatConfiguration("sandbox", "rcb_publicfixture"),
    ).toMatchObject({ status: "invalid", configured: false });
    expect(parseRevenueCatConfiguration("live", undefined)).toMatchObject({
      status: "unconfigured",
      configured: false,
    });
  });
});

describe("RevenueCat identity controller", () => {
  it("persists one guest identity and configures the SDK only once", async () => {
    const sdk = new FakeSdk();
    const manager = new RevenueCatClientManager(
      "test_publicfixture",
      sdk,
      localStorage,
    );

    const seen = await Promise.all([
      manager.runForUser(null, async (purchases) => purchases.getAppUserId()),
      manager.runForUser(null, async (purchases) => purchases.getAppUserId()),
    ]);

    expect(sdk.configureCalls).toBe(1);
    expect(seen[0]).toBe(seen[1]);
    expect(localStorage.getItem(REVENUECAT_ANONYMOUS_ID_KEY)).toBe(seen[0]);
  });

  it("restores a persisted guest identity in a new manager", async () => {
    localStorage.setItem(
      REVENUECAT_ANONYMOUS_ID_KEY,
      "$RCAnonymousID:persisted00000000000000000000000",
    );
    const sdk = new FakeSdk();
    const manager = new RevenueCatClientManager(
      "test_publicfixture",
      sdk,
      localStorage,
    );

    const seen = await manager.runForUser(
      null,
      async (purchases) => purchases.getAppUserId(),
    );

    expect(seen).toBe("$RCAnonymousID:persisted00000000000000000000000");
    expect(sdk.generated).toBe(0);
  });

  it("preserves guest purchases on sign-in and isolates sign-out", async () => {
    const sdk = new FakeSdk();
    const manager = new RevenueCatClientManager(
      "test_publicfixture",
      sdk,
      localStorage,
    );
    const guestId = await manager.runForUser(
      null,
      async (purchases) => purchases.getAppUserId(),
    );

    await manager.runForUser("user-a", async () => undefined);
    expect(sdk.getSharedInstance().identifiedAs).toEqual(["user-a"]);
    const reservedGuestId = localStorage.getItem(
      REVENUECAT_ANONYMOUS_ID_KEY,
    );
    expect(reservedGuestId).toMatch(/^\$RCAnonymousID:/);
    expect(reservedGuestId).not.toBe(guestId);

    const signedOutId = await manager.runForUser(
      null,
      async (purchases) => purchases.getAppUserId(),
    );
    expect(signedOutId).toMatch(/^\$RCAnonymousID:/);
    expect(signedOutId).not.toBe(guestId);
    expect(sdk.getSharedInstance().changedTo).toContain(signedOutId);
  });

  it("switches signed-in accounts without aliasing them", async () => {
    const sdk = new FakeSdk();
    const manager = new RevenueCatClientManager(
      "test_publicfixture",
      sdk,
      localStorage,
    );

    await manager.runForUser("user-a", async () => undefined);
    await manager.runForUser("user-b", async () => undefined);

    expect(sdk.getSharedInstance().identifiedAs).toEqual([]);
    expect(sdk.getSharedInstance().changedTo).toEqual(["user-b"]);
  });
});

describe("RevenueCat offering and paywall state", () => {
  it("uses only the current offering and requires its published paywall", () => {
    const current = offering("current", false);
    const snapshot = snapshotFromRevenueCat(
      { current },
      customerInfo(),
    );

    expect(snapshot.offering).toBe(current);
    expect(snapshot.canPurchase).toBe(false);
    expect(
      snapshotFromRevenueCat(
        { current: offering("empty", true, []) },
        customerInfo(),
      ).canPurchase,
    ).toBe(false);
    expect(
      snapshotFromRevenueCat(
        { current: offering("ready", true) },
        customerInfo(),
      ).canPurchase,
    ).toBe(true);
  });

  it("maps active Plus with no safe management URL explicitly", () => {
    const snapshot = snapshotFromRevenueCat(
      { current: offering("ready", true) },
      customerInfo(["BibleQuest Plus"], "javascript:alert(1)"),
    );

    expect(snapshot.plan).toBe("plus");
    expect(snapshot.managementURL).toBeNull();
    expect(statusFromSnapshot(snapshot)).toBe("management-unavailable");
  });

  it("keeps active entitlements Plus until expiration, then returns to free", () => {
    const current = offering("ready", true);
    const active = snapshotFromRevenueCat(
      { current },
      customerInfo(
        ["BibleQuest Plus"],
        "https://billing.example.test/manage",
      ),
    );
    const expired = snapshotFromRevenueCat(
      { current },
      customerInfo([], null),
    );

    expect(statusFromSnapshot(active)).toBe("plus");
    expect(active.plan).toBe("plus");
    expect(statusFromSnapshot(expired)).toBe("free");
    expect(expired.plan).toBe("free");
  });

  it("treats paywall cancellation as a calm, non-error outcome", async () => {
    const presentPaywall = vi.fn().mockRejectedValue({ errorCode: 1 });
    const result = await presentCurrentPaywall(
      { presentPaywall } as Pick<Purchases, "presentPaywall">,
      offering("ready", true),
    );

    expect(result).toEqual({ kind: "cancelled" });
  });

  it("contains paywall errors and refuses incomplete offerings", async () => {
    const presentPaywall = vi
      .fn()
      .mockRejectedValue(new Error("sensitive operational detail"));
    const purchases = {
      presentPaywall,
    } as Pick<Purchases, "presentPaywall">;

    expect(
      await presentCurrentPaywall(purchases, offering("ready", true)),
    ).toEqual({ kind: "failed" });
    expect(
      await presentCurrentPaywall(purchases, offering("draft", false)),
    ).toEqual({ kind: "unavailable" });
    expect(presentPaywall).toHaveBeenCalledTimes(1);
  });
});
