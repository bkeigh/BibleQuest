import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  isModernSupabasePublishableKey,
  supabasePublishableKey,
} from "@/native/guest/lib/supabase/config";
import { supabasePublishableKey as canonicalSupabasePublishableKey } from "@/lib/supabase/config";
import {
  fetchNativeAccountBetaAvailability,
  refreshNativeAccountBetaAvailability,
  requireNativeAccountBetaAvailability,
} from "@/native/guest/lib/sync/availability";
import {
  assertNativeAccountBetaAvailability,
  NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE,
  parseNativeAccountBetaAvailability,
} from "@/native/guest/lib/sync/native-beta-contract";
import {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_CONTRACT,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
} from "@/native/guest/lib/sync/native-beta-headers";
import {
  GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS,
} from "@/lib/sync/native-account-markers.mjs";

const GUEST_MODULES = [
  "src/native/guest/lib/supabase/config.ts",
  "src/native/guest/lib/sync/availability.ts",
  "src/native/guest/lib/sync/native-account-markers.mjs",
  "src/native/guest/lib/sync/native-beta-contract.ts",
  "src/native/guest/lib/sync/native-beta-headers.ts",
];

const EXPECTED_FORBIDDEN_MARKERS = [
  "x-biblequest-native-account-beta",
  "biblequest_native_account_beta_v1",
  "native_account_beta_availability",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "x-biblequest-expected-user",
  "x-biblequest-account-deletion-cleanup",
  "x-biblequest-disabled",
  "native_account_beta_unavailable",
];

/** Builds a harmless legacy anonymous JWT shape accepted by canonical fallback. */
function legacyAnonymousKeyFixture(): string {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
    Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url"),
    "fixture-signature",
  ].join(".");
}

describe("guest native account modules", () => {
  it("rejects configuration, probes, and authenticated contract checks", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const rpc = vi.fn();
    const keyCandidate = `sb_publishable_${"a".repeat(32)}`;
    const legacyKeyCandidate = legacyAnonymousKeyFixture();

    expect(isModernSupabasePublishableKey(keyCandidate)).toBe(false);
    expect(
      supabasePublishableKey({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keyCandidate,
      }),
    ).toBeNull();
    expect(
      supabasePublishableKey({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyKeyCandidate,
      }),
    ).toBeNull();
    expect(
      canonicalSupabasePublishableKey({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyKeyCandidate,
      }),
    ).toBe(legacyKeyCandidate);
    await expect(
      fetchNativeAccountBetaAvailability({
        fetcher,
        publishableKey: keyCandidate,
        supabaseOrigin: "https://abcdefghijklmnopqrst.supabase.co",
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(requireNativeAccountBetaAvailability()).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(
      assertNativeAccountBetaAvailability({ rpc } as unknown as SupabaseClient),
    ).rejects.toMatchObject({ code: "unavailable" });

    expect(fetcher).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    await expect(refreshNativeAccountBetaAvailability()).resolves.toBe(false);
    expect(parseNativeAccountBetaAvailability({})).toBeNull();
    expect(NATIVE_ACCOUNT_BETA_CONTRACT).toBe("disabled");
    expect(NATIVE_ACCOUNT_BETA_HEADER).toBe("");
    expect(NATIVE_ACCOUNT_BETA_HEADER_VALUE).toBe("");
    expect(EXPECTED_ACCOUNT_USER_HEADER).toBe("");
    expect(ACCOUNT_DELETION_CLEANUP_HEADER).toBe("");
    expect(ACCOUNT_DELETION_CLEANUP_HEADER_VALUE).toBe("");
    expect(NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE).toBe("unavailable");
    for (const [header, value] of [
      [NATIVE_ACCOUNT_BETA_HEADER, NATIVE_ACCOUNT_BETA_HEADER_VALUE],
      [EXPECTED_ACCOUNT_USER_HEADER, "fixture-user"],
      [
        ACCOUNT_DELETION_CLEANUP_HEADER,
        ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
      ],
    ]) {
      expect(() => new Headers().set(header, value)).toThrow(TypeError);
    }
  });

  it("derives the reviewed native account scan from the shared contract", () => {
    const builder = readFileSync("scripts/build-native.mjs", "utf8");
    expect(new Set(GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS)).toEqual(
      new Set(EXPECTED_FORBIDDEN_MARKERS),
    );
    expect(builder).toMatch(
      /function stageGuestAccountContainment\(\) \{\s*if \(!releaseBuild\) return;/,
    );
    expect(builder).toContain("stageGuestAccountContainment();");
    expect(builder).toContain("verifyGuestAccountMarkersAbsent();");
    expect(builder).toContain("GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS");
    expect(builder).not.toMatch(
      /const GUEST_FORBIDDEN_ACCOUNT_MARKERS\s*=\s*\[/,
    );
    for (const [source, destination] of [
      [
        "src/native/guest/lib/supabase/config.ts",
        "src/lib/supabase/config.ts",
      ],
      [
        "src/native/guest/lib/sync/native-account-markers.mjs",
        "src/lib/sync/native-account-markers.mjs",
      ],
      [
        "src/native/guest/lib/sync/native-beta-headers.ts",
        "src/lib/sync/native-beta-headers.ts",
      ],
      [
        "src/native/guest/lib/sync/native-beta-contract.ts",
        "src/lib/sync/native-beta-contract.ts",
      ],
      [
        "src/native/guest/lib/sync/availability.ts",
        "src/lib/sync/availability.ts",
      ],
    ]) {
      expect(builder).toContain(`"${source}"`);
      expect(builder).toContain(`"${destination}"`);
    }
    expect(builder.lastIndexOf("stageGuestAccountContainment();")).toBeLessThan(
      builder.lastIndexOf("build();"),
    );

    for (const path of GUEST_MODULES) {
      const source = readFileSync(path, "utf8");
      for (const marker of GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS) {
        expect(source, `${path}: ${marker}`).not.toContain(marker);
      }
    }
  });

  it("keeps every staged module's export names aligned", async () => {
    const pairs = await Promise.all([
      Promise.all([
        import("@/lib/supabase/config"),
        import("@/native/guest/lib/supabase/config"),
      ]),
      Promise.all([
        import("@/lib/sync/native-beta-headers"),
        import("@/native/guest/lib/sync/native-beta-headers"),
      ]),
      Promise.all([
        import("@/lib/sync/native-account-markers.mjs"),
        import("@/native/guest/lib/sync/native-account-markers.mjs"),
      ]),
      Promise.all([
        import("@/lib/sync/native-beta-contract"),
        import("@/native/guest/lib/sync/native-beta-contract"),
      ]),
      Promise.all([
        import("@/lib/sync/availability"),
        import("@/native/guest/lib/sync/availability"),
      ]),
    ]);

    for (const [canonical, guest] of pairs) {
      expect(Object.keys(guest).sort()).toEqual(Object.keys(canonical).sort());
    }
  });
});
