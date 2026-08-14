import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/app/api/profile/avatar/route.ts",
  "utf8",
);
const syncManager = readFileSync(
  "src/components/app-shell/AvatarSyncManager.tsx",
  "utf8",
);
const settings = readFileSync(
  "src/components/settings/SettingsScreen.tsx",
  "utf8",
);
const accountDeletion = readFileSync(
  "src/lib/auth/account-deletion.ts",
  "utf8",
);

/** Returns one Settings handler for narrow account-boundary assertions. */
function settingsHandler(name: string, nextMarker: string): string {
  const start = settings.indexOf(`async function ${name}`);
  const end = settings.indexOf(nextMarker, start);
  return settings.slice(start, end);
}

describe("avatar API boundaries", () => {
  it("claims local and distributed account capacity before image decoding", () => {
    const localGuard = route.indexOf("guardIdentifiedRequest(");
    const distributedGuard = route.indexOf("guardDistributedRequest(");
    const decode = route.indexOf("normalizeAvatarImage(");

    expect(localGuard).toBeGreaterThan(-1);
    expect(distributedGuard).toBeGreaterThan(localGuard);
    expect(decode).toBeGreaterThan(distributedGuard);
    expect(route).toContain("`avatar-upload:${user.id}`");
    expect(route).toContain("AVATAR_UPLOAD_RATE_POLICIES");
  });

  it("uses the disabled-beta cleanup bypass only for captured native deletion", () => {
    expect(route).toContain("const accountDeletionCleanup =");
    expect(route).toContain(
      "const accountDeletionCleanup =\n      allOwnedObjects &&",
    );
    expect(route).toContain("const nativeDeletionCleanup =");
    expect(route).toContain(
      "nativeDeletionCleanup =\n      accountDeletionCleanup && isNativeAppOrigin(request)",
    );
    expect(route).toContain("isNativeAppOrigin(request)");
    expect(route).toContain(
      "request.headers.get(EXPECTED_ACCOUNT_USER_HEADER) === user.id",
    );
    expect(route.indexOf("if (!nativeDeletionCleanup) {")).toBeLessThan(
      route.indexOf("if (allOwnedObjects) {", route.indexOf("export async function DELETE")),
    );
    expect(route.indexOf('supabase.rpc("begin_own_account_deletion")')).toBeLessThan(
      route.indexOf("if (allOwnedObjects) {", route.indexOf("export async function DELETE")),
    );
    expect(route).toContain("function missingAccountDeletionLatch(");
    expect(route).toContain(
      "nativeDeletionCleanup || !missingAccountDeletionLatch(error)",
    );
    expect(route).toContain('candidate.code === "PGRST202"');
    expect(route).toContain('candidate.code === "42883"');
  });

  it("uses the verified bearer client for every Storage operation", () => {
    const storageBoundary = route.indexOf(
      "const { storageSupabase, supabase, user } = context",
    );
    const ownerSweep = route.indexOf(
      "removeAllOwnedObjects(storageSupabase, user.id)",
    );

    expect(storageBoundary).toBeGreaterThan(-1);
    expect(ownerSweep).toBeGreaterThan(storageBoundary);
    expect(route).not.toContain("createAdminSupabase");
    expect(route).not.toContain("supabase.storage");
  });

  it("pins background avatar reconciliation to its captured account", () => {
    expect(syncManager).toContain("const expectedUserId = userId;");
    expect(syncManager).toContain(
      "downloadRemoteAvatar(\n          expectedUserId,",
    );
    expect(syncManager).toContain(
      "uploadRemoteAvatar(\n            expectedUserId,",
    );
    expect(syncManager).toContain(
      "[configured, loading, marker, userId]",
    );
  });

  it("captures the Settings account before ordinary avatar work", () => {
    const upload = settingsHandler("onPhotoPicked", "\n\n  async function removePhoto");
    const remove = settingsHandler("removePhoto", "\n\n  function exportData");

    expect(upload.indexOf("const expectedUserId = user?.id ?? null;")).toBeLessThan(
      upload.indexOf("await validateAvatarFile(file)"),
    );
    expect(upload).toContain(
      "uploadRemoteAvatar(\n          expectedUserId,",
    );
    expect(remove).toContain("const expectedUserId = user?.id ?? null;");
    expect(remove).toContain("deleteRemoteAvatar(expectedUserId, {");
    expect(remove).not.toContain("accountDeletionCleanup");
  });

  it("keeps Clear Journey unprivileged while account deletion is explicit", () => {
    const clear = settingsHandler("clearJourneyData", "\n\n  return (");

    expect(clear).toContain("const expectedUserId = user?.id ?? null;");
    expect(clear).toContain(
      "deleteRemoteAvatar(expectedUserId, { allOwnedObjects: true })",
    );
    expect(clear).not.toContain("accountDeletionCleanup");
    expect(accountDeletion).toContain("allOwnedObjects: true");
    expect(accountDeletion).toContain("accountDeletionCleanup: true");
  });
});
