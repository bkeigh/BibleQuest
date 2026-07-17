/**
 * RevenueCat browser client.
 *
 * Billing is explicitly activated through a mode + matching public SDK key.
 * The default coming-soon mode never imports or configures RevenueCat. Secret
 * keys are rejected by the configuration parser and must never reach client
 * code.
 */
import type { Purchases } from "@revenuecat/purchases-js";
import {
  parseRevenueCatConfiguration,
  type RevenueCatConfigurationStatus,
} from "./config";

const runtimeConfiguration = parseRevenueCatConfiguration(
  process.env.NEXT_PUBLIC_REVENUECAT_BILLING_MODE,
  process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY,
);

const configuredEntitlement =
  process.env.NEXT_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT?.trim();

export const PLUS_ENTITLEMENT_ID =
  configuredEntitlement || "BibleQuest Plus";

export interface RevenueCatAvailability {
  status: RevenueCatConfigurationStatus;
  configured: boolean;
}
export function getRevenueCatAvailability(): RevenueCatAvailability {
  return {
    status: runtimeConfiguration.status,
    configured: runtimeConfiguration.configured,
  };
}

export function isRevenueCatConfigured(): boolean {
  return runtimeConfiguration.configured;
}

export const REVENUECAT_ANONYMOUS_ID_KEY = "biblequest:rc-anon-id";

type StorageAdapter = Pick<Storage, "getItem" | "setItem">;

export interface IdentityPurchases {
  getAppUserId(): string;
  changeUser(appUserId: string): Promise<unknown>;
  identifyUser(appUserId: string): Promise<unknown>;
}

export interface RevenueCatSdkAdapter<T extends IdentityPurchases> {
  configure(options: { apiKey: string; appUserId: string }): T;
  getSharedInstance(): T;
  isConfigured(): boolean;
  generateRevenueCatAnonymousAppUserId(): string;
}

type Identity =
  | { kind: "anonymous"; appUserId: string }
  | { kind: "signed-in"; appUserId: string };

function identityFromAppUserId(appUserId: string): Identity {
  return {
    kind: appUserId.startsWith("$RCAnonymousID:")
      ? "anonymous"
      : "signed-in",
    appUserId,
  };
}

/**
 * Serializes configuration, identity transitions, and customer operations.
 * This prevents an account switch from racing an entitlement fetch for the
 * previous account.
 */
export class RevenueCatClientManager<
  T extends IdentityPurchases = Purchases,
> {
  private instance: T | null = null;
  private identity: Identity | null = null;
  private anonymousIdInMemory: string | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly apiKey: string,
    private readonly sdk: RevenueCatSdkAdapter<T>,
    private readonly storage: StorageAdapter | null,
  ) {}

  runForUser<R>(
    signedInUserId: string | null,
    operation: (purchases: T) => Promise<R>,
  ): Promise<R> {
    const pending = this.queue.then(async () => {
      const purchases = await this.prepareForUser(signedInUserId);
      return operation(purchases);
    });
    this.queue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private async prepareForUser(signedInUserId: string | null): Promise<T> {
    if (!this.instance) {
      if (this.sdk.isConfigured()) {
        this.instance = this.sdk.getSharedInstance();
        this.identity = identityFromAppUserId(this.instance.getAppUserId());
      } else {
        const initialIdentity = signedInUserId
          ? ({ kind: "signed-in", appUserId: signedInUserId } as const)
          : ({
              kind: "anonymous",
              appUserId: this.getOrCreateAnonymousId(),
            } as const);
        this.instance = this.sdk.configure({
          apiKey: this.apiKey,
          appUserId: initialIdentity.appUserId,
        });
        this.identity = initialIdentity;
      }
    }

    if (!this.identity) {
      this.identity = identityFromAppUserId(this.instance.getAppUserId());
    }

    if (signedInUserId) {
      await this.moveToSignedInUser(signedInUserId);
    } else {
      await this.moveToAnonymousUser();
    }

    return this.instance;
  }

  private async moveToSignedInUser(appUserId: string): Promise<void> {
    if (!this.instance || !this.identity) return;
    if (
      this.identity.kind === "signed-in" &&
      this.identity.appUserId === appUserId
    ) {
      return;
    }

    if (this.identity.kind === "anonymous") {
      // Preserve a legitimate guest purchase by aliasing it to the account.
      // Immediately reserve a fresh guest ID so signing out cannot return to
      // the newly aliased identity and expose this account's entitlement.
      await this.instance.identifyUser(appUserId);
      this.createFreshAnonymousId();
    } else {
      // Account A -> account B must never merge or transfer entitlements.
      await this.instance.changeUser(appUserId);
    }
    this.identity = { kind: "signed-in", appUserId };
  }

  private async moveToAnonymousUser(): Promise<void> {
    if (!this.instance || !this.identity) return;

    if (this.identity.kind === "signed-in") {
      // Always create a new guest after sign-out. Reusing an anonymous alias
      // could leak the signed-in customer's entitlement on a shared device.
      const appUserId = this.createFreshAnonymousId();
      await this.instance.changeUser(appUserId);
      this.identity = { kind: "anonymous", appUserId };
      return;
    }

    const appUserId = this.getOrCreateAnonymousId();
    if (this.identity.appUserId !== appUserId) {
      await this.instance.changeUser(appUserId);
      this.identity = { kind: "anonymous", appUserId };
    }
  }

  private getOrCreateAnonymousId(): string {
    if (this.anonymousIdInMemory) return this.anonymousIdInMemory;

    try {
      const stored = this.storage?.getItem(REVENUECAT_ANONYMOUS_ID_KEY);
      if (stored?.startsWith("$RCAnonymousID:")) {
        this.anonymousIdInMemory = stored;
        return stored;
      }
    } catch {
      // Private browsing/storage denial still gets a stable in-memory identity.
    }

    return this.createFreshAnonymousId();
  }

  private createFreshAnonymousId(): string {
    const appUserId = this.sdk.generateRevenueCatAnonymousAppUserId();
    this.anonymousIdInMemory = appUserId;
    try {
      this.storage?.setItem(REVENUECAT_ANONYMOUS_ID_KEY, appUserId);
    } catch {
      // The in-memory value remains stable for this page lifecycle.
    }
    return appUserId;
  }
}

let managerPromise: Promise<RevenueCatClientManager> | null = null;

async function getManager(): Promise<RevenueCatClientManager | null> {
  if (!runtimeConfiguration.configured || !runtimeConfiguration.apiKey) {
    return null;
  }
  if (!managerPromise) {
    managerPromise = import("@revenuecat/purchases-js").then(
      ({ Purchases: sdk }) =>
        new RevenueCatClientManager(
          runtimeConfiguration.apiKey!,
          sdk,
          typeof window === "undefined" ? null : window.localStorage,
        ),
    );
  }
  return managerPromise;
}

/** Run an SDK operation under a serialized, verified RevenueCat identity. */
export async function runRevenueCatOperation<R>(
  signedInUserId: string | null,
  operation: (purchases: Purchases) => Promise<R>,
): Promise<R | null> {
  if (typeof window === "undefined") return null;
  const manager = await getManager();
  return manager ? manager.runForUser(signedInUserId, operation) : null;
}
