import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  optionalSupportUser,
  stripeSupportAvailability,
  stripeSupportContractReady,
} from "@/lib/support/server";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Installs a complete fake test configuration without real provider values. */
function configureSupport() {
  vi.stubEnv("STRIPE_BILLING_MODE", "test");
  vi.stubEnv("STRIPE_SECRET_KEY", `sk_test_${"a".repeat(24)}`);
  vi.stubEnv(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    `pk_test_${"b".repeat(24)}`,
  );
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", `whsec_${"c".repeat(24)}`);
  vi.stubEnv("STRIPE_PLUS_MONTHLY_PRICE_ID", "price_TestMonthly123");
  vi.stubEnv("STRIPE_PLUS_ANNUAL_PRICE_ID", "price_TestAnnual123");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.biblequest.test");
  vi.stubEnv("BIBLEQUEST_STRIPE_SUPPORT_ENABLED", "true");
}

describe("one-time support server posture", () => {
  it("shows controls only behind a complete, separate Stripe gate", () => {
    vi.stubEnv("STRIPE_BILLING_MODE", "coming-soon");
    expect(stripeSupportAvailability()).toEqual({
      enabled: false,
      mode: null,
    });
    configureSupport();
    expect(stripeSupportAvailability()).toEqual({
      enabled: true,
      mode: "test",
    });
    vi.stubEnv("BIBLEQUEST_STRIPE_SUPPORT_ENABLED", "false");
    expect(stripeSupportAvailability()).toEqual({
      enabled: false,
      mode: "test",
    });
  });

  it("accepts only the exact fixed database readiness response", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        contract: "biblequest_stripe_one_time_support_v1",
        ok: true,
      },
      error: null,
    });
    expect(
      await stripeSupportContractReady({ rpc } as unknown as SupabaseClient),
    ).toBe(true);

    rpc.mockResolvedValue({
      data: {
        contract: "biblequest_stripe_one_time_support_v1",
        ok: true,
        private: "must reject",
      },
      error: null,
    });
    expect(
      await stripeSupportContractReady({ rpc } as unknown as SupabaseClient),
    ).toBe(false);
  });

  it("uses an optional verified session and fails guest-safe", async () => {
    const user = {
      id: "d1000000-0000-4000-8000-000000000001",
      email: "verified@example.test",
    };
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: null,
        }),
      },
    } as unknown as SupabaseClient;
    await expect(optionalSupportUser(async () => client)).resolves.toBe(user);

    await expect(
      optionalSupportUser(async () => {
        throw new Error("private provider");
      }),
    ).resolves.toBeNull();
  });
});
