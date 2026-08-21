import { describe, expect, it } from "vitest";
import {
  findGuestAccountArtifactViolation,
  GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_LITERALS,
} from "@/lib/sync/guest-account-artifact-contract.mjs";

describe("guest account artifact contract", () => {
  it("allows truthful guest copy and local-only account prompt state", () => {
    const allowed = [
      "Account sync is unavailable in this version.",
      "BibleQuest uses Supabase when you choose an account-enabled build.",
      "ACCOUNT_SYNC_CONTAINED",
      "ACCOUNT_SYNC_CONTAINMENT_NOTICE",
      "accountNudge",
      "markAccountNudgeShown",
      "purgeAccount:null",
      "signOut:Sign out",
      "local avatar",
    ].join("\n");

    expect(findGuestAccountArtifactViolation(allowed)).toBeNull();
  });

  it.each([
    ["library", "@supabase/supabase-js"],
    ["configuration", "NEXT_PUBLIC_SUPABASE_URL"],
    ["project", "https://abcdefghijklmnopqrst.supabase.co"],
    ["numeric project", "http://abc123def456ghi789jk.supabase.co"],
    ["sdk endpoint", "/auth/v1/user"],
    ["credential exchange", "exchangeCodeForSession"],
    ["password sign-in", "signInWithPassword"],
    ["session refresh", "refreshSession"],
    ["credential field", "refresh_token"],
    ["wire header", "x-biblequest-any-new-account-header"],
    ["customer callback", "/auth/customer-callback"],
    ["remote avatar", "/api/profile/avatar"],
    ["remote avatar bucket", "profile-avatars"],
    ["signed avatar URL", "createSignedUrl"],
    ["future auth route", "/api/auth/login"],
    ["arcade commerce", "/api/arcade/checkout"],
    ["billing commerce", "/api/billing/status"],
    ["support commerce", "/api/support/checkout"],
    ["checkout host", "checkout.stripe.com"],
    ["sync RPC", "upsert_mutable_account_rows"],
    ["sync contract", "biblequest_account_sync_v4"],
    ["auth storage", "biblequest:web-auth:v2"],
    ["private storage", "biblequest:web-private:v2:journey"],
    ["account storage", "biblequest:last-sync-user"],
    ["auth client", "__biblequestSupabaseBrowserClient"],
    ["legacy helper", "withWebAuthStorageLock"],
  ])("rejects an operational %s marker", (_label, marker) => {
    expect(findGuestAccountArtifactViolation(`before:${marker}:after`)).not.toBeNull();
  });

  it("keeps the reviewed contract broad enough to cover each marker class", () => {
    expect(GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_LITERALS).toEqual(
      expect.arrayContaining([
        "@supabase/",
        "NEXT_PUBLIC_SUPABASE_",
        "/auth/v1",
        "exchangeCodeForSession",
        "refresh_token",
        "/auth/customer-callback",
        "/api/profile/avatar",
        "upsert_mutable_account_rows",
        "biblequest_account_sync_v4",
        "biblequest:web-auth",
        "biblequest:web-private",
        "biblequest:last-sync-user",
        "__biblequestSupabase",
        "withWebAuthStorageLock",
      ]),
    );
  });
});
