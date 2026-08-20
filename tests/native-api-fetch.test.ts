import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const HOSTED = "NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN";
const ACCOUNT_SYNC = "NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED";
const ACCOUNT_BETA = "NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED";
const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";

type FetchArgs = [string, RequestInit | undefined];

function stubFetch(
  responseForCall?: (url: string, init?: RequestInit) => Response,
) {
  const calls: FetchArgs[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return responseForCall?.(url, init) ?? new Response(null, { status: 204 });
    }),
  );
  return calls;
}

/** Returns the narrow normalized response accepted by the avatar client. */
function avatarResponse() {
  return new Response(new Blob([new Uint8Array([1])], { type: "image/webp" }), {
    headers: {
      "Content-Type": "image/webp",
      "X-BibleQuest-Avatar-Version":
        "10000000-0000-4000-8000-000000000001",
      "X-BibleQuest-Avatar-Updated-At": "2026-08-11T12:00:00.000Z",
    },
  });
}

async function apiModule() {
  return import("@/lib/platform/api");
}

function mockSupabaseClient(
  accessToken: string | null,
  userId = USER_A,
  configured = true,
) {
  const createClient = vi.fn(() => ({
    auth: {
      getSession: async () => ({
        data: {
          session: accessToken
            ? { access_token: accessToken, user: { id: userId } }
            : null,
        },
        error: null,
      }),
    },
  }));
  vi.doMock("@/lib/supabase/client", () => ({
    isSupabaseConfigured: () => configured,
    createClient,
  }));
  return createClient;
}

/** Supplies one exact v2 web credential without exposing browser cookies. */
function mockWebAuthSession(
  accessToken: string | null,
  userId = USER_A,
) {
  const readActiveWebAuthSession = vi.fn(async () =>
    accessToken
      ? {
          userId,
          accessToken,
          refreshToken: "fixture-refresh-token",
        }
      : null,
  );
  const readExpectedWebAuthSession = vi.fn(
    async (expectedUserId: string, allowedModes: readonly string[]) => {
      if (
        !accessToken ||
        expectedUserId !== userId ||
        allowedModes.length !== 1 ||
        allowedModes[0] !== "deleting"
      ) {
        throw new Error("web auth unavailable");
      }
      return {
        userId,
        accessToken,
        refreshToken: "fixture-refresh-token",
      };
    },
  );
  vi.doMock("@/lib/supabase/web-auth-storage", () => ({
    readActiveWebAuthSession,
    readExpectedWebAuthSession,
  }));
  return { readActiveWebAuthSession, readExpectedWebAuthSession };
}

/** Makes the anonymous remote gate explicit in authenticated API tests. */
function mockAvailability(available = true) {
  const requireNativeAccountBetaAvailability = vi.fn(async () => {
    if (!available) {
      throw Object.assign(new Error("unavailable"), {
        code: "native_account_beta_unavailable",
      });
    }
  });
  vi.doMock("@/lib/sync/availability", () => ({
    requireNativeAccountBetaAvailability,
  }));
  return requireNativeAccountBetaAvailability;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete process.env[PLATFORM];
  delete process.env[HOSTED];
  delete process.env[ACCOUNT_SYNC];
  delete process.env[ACCOUNT_BETA];
  vi.doUnmock("@/lib/supabase/client");
  vi.doUnmock("@/lib/sync/availability");
  vi.doUnmock("@/lib/supabase/web-auth-storage");
  vi.unstubAllGlobals();
});

describe("apiFetch on the web target", () => {
  it("forces public requests anonymous and removes reserved authority", async () => {
    const calls = stubFetch();
    const { apiFetch } = await apiModule();
    const init = {
      method: "POST",
      credentials: "same-origin" as const,
      headers: {
        Authorization: "Bearer caller-owned",
        "x-biblequest-account-deletion-cleanup": "v1",
        "x-biblequest-expected-user": USER_A,
        "x-biblequest-native-account-beta": "v1",
        "x-biblequest-web-auth": "v2",
        "x-biblequest-future-authority": "caller-owned",
        "x-public": "kept",
      },
    };
    await apiFetch("/api/arcade/status", init);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("/api/arcade/status");
    expect(calls[0][1]?.credentials).toBe("omit");
    const headers = new Headers(calls[0][1]?.headers);
    expect(headers.get("x-public")).toBe("kept");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-biblequest-account-deletion-cleanup")).toBe(false);
    expect(headers.has("x-biblequest-expected-user")).toBe(false);
    expect(headers.has("x-biblequest-native-account-beta")).toBe(false);
    expect(headers.has("x-biblequest-web-auth")).toBe(false);
    expect(headers.has("x-biblequest-future-authority")).toBe(false);
  });

  it("sends only the exact active v2 bearer for a captured web subject", async () => {
    const calls = stubFetch();
    const reads = mockWebAuthSession("web-session-token");
    const { authenticatedApiFetch } = await apiModule();

    await authenticatedApiFetch(USER_A, "/api/arcade/status", {
      credentials: "include",
      headers: {
        Authorization: "Bearer caller-owned",
        "x-biblequest-account-deletion-cleanup": "v1",
        "x-biblequest-native-account-beta": "v1",
        "x-biblequest-web-auth": "caller-owned",
      },
    });

    expect(reads.readActiveWebAuthSession).toHaveBeenCalledOnce();
    expect(reads.readExpectedWebAuthSession).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]?.credentials).toBe("omit");
    const headers = new Headers(calls[0][1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer web-session-token");
    expect(headers.get("x-biblequest-expected-user")).toBe(USER_A);
    expect(headers.has("x-biblequest-account-deletion-cleanup")).toBe(false);
    expect(headers.has("x-biblequest-native-account-beta")).toBe(false);
    expect(headers.get("x-biblequest-web-auth")).toBe("v2");
  });

  it("refuses absent or replacement web credentials before fetch", async () => {
    const calls = stubFetch();
    mockWebAuthSession("account-b-token", USER_B);
    const { authenticatedApiFetch } = await apiModule();

    await expect(
      authenticatedApiFetch(USER_A, "/api/arcade/status"),
    ).rejects.toMatchObject({ code: "native_account_beta_unavailable" });
    expect(calls).toHaveLength(0);
  });

  it("adds the cleanup marker only through the fixed deletion helper", async () => {
    const calls = stubFetch();
    const reads = mockWebAuthSession("web-session-token");
    const { accountDeletionAvatarFetch } = await apiModule();
    const webOperation = {} as NonNullable<
      Parameters<typeof accountDeletionAvatarFetch>[2]
    >;

    await accountDeletionAvatarFetch(USER_A, undefined, webOperation);

    expect(reads.readActiveWebAuthSession).not.toHaveBeenCalled();
    expect(reads.readExpectedWebAuthSession).toHaveBeenCalledWith(
      USER_A,
      ["deleting"],
      webOperation,
    );
    const headers = new Headers(calls[0][1]?.headers);
    expect(calls[0][1]?.credentials).toBe("omit");
    expect(headers.get("authorization")).toBe("Bearer web-session-token");
    expect(headers.get("x-biblequest-expected-user")).toBe(USER_A);
    expect(headers.get("x-biblequest-account-deletion-cleanup")).toBe("v1");
    expect(headers.get("x-biblequest-web-auth")).toBe("v2");
  });

  it("requires the retained account-operation handle for web deletion", async () => {
    const calls = stubFetch();
    const reads = mockWebAuthSession("web-session-token");
    const { accountDeletionAvatarFetch } = await apiModule();

    await expect(accountDeletionAvatarFetch(USER_A)).rejects.toMatchObject({
      code: "native_account_beta_unavailable",
    });

    expect(calls).toHaveLength(0);
    expect(reads.readActiveWebAuthSession).not.toHaveBeenCalled();
    expect(reads.readExpectedWebAuthSession).not.toHaveBeenCalled();
  });

  it("keeps deleting credentials exclusive to the exact deletion transport", async () => {
    const calls = stubFetch();
    const readActiveWebAuthSession = vi.fn(async () => {
      throw new Error("terminal web session");
    });
    const readExpectedWebAuthSession = vi.fn(
      async (
        expectedUserId: string,
        allowedModes: readonly string[],
        webOperation: unknown,
      ) => {
        if (
          expectedUserId !== USER_A ||
          allowedModes.length !== 1 ||
          allowedModes[0] !== "deleting" ||
          !webOperation
        ) {
          throw new Error("web auth unavailable");
        }
        return {
          userId: USER_A,
          accessToken: "deleting-session-token",
          refreshToken: "fixture-refresh-token",
        };
      },
    );
    vi.doMock("@/lib/supabase/web-auth-storage", () => ({
      readActiveWebAuthSession,
      readExpectedWebAuthSession,
    }));
    const { accountDeletionAvatarFetch, authenticatedApiFetch } =
      await apiModule();
    const webOperation = {} as NonNullable<
      Parameters<typeof accountDeletionAvatarFetch>[2]
    >;

    await expect(
      authenticatedApiFetch(USER_A, "/api/profile/avatar"),
    ).rejects.toThrow("terminal web session");
    expect(calls).toHaveLength(0);

    await accountDeletionAvatarFetch(USER_A, undefined, webOperation);
    expect(calls).toHaveLength(1);
    expect(
      new Headers(calls[0][1]?.headers).get("authorization"),
    ).toBe("Bearer deleting-session-token");

    await expect(
      accountDeletionAvatarFetch(USER_B, undefined, webOperation),
    ).rejects.toThrow("web auth unavailable");
    expect(calls).toHaveLength(1);
    expect(readExpectedWebAuthSession).toHaveBeenCalledWith(
      USER_A,
      ["deleting"],
      webOperation,
    );
  });

  it("still throws synchronously on an invalid path", async () => {
    stubFetch();
    const { apiFetch } = await apiModule();
    const { PlatformConfigurationError } = await import(
      "@/lib/platform/runtime"
    );
    expect(() => apiFetch("/not-api")).toThrow(PlatformConfigurationError);
  });
});

describe("apiFetch on the native target", () => {
  beforeEach(() => {
    process.env[PLATFORM] = "native";
    process.env[HOSTED] = "https://www.biblequest.co";
    process.env[ACCOUNT_SYNC] = "true";
    process.env[ACCOUNT_BETA] = "true";
  });

  it("injects an exact-user bearer only after the live availability check", async () => {
    const calls = stubFetch();
    const availability = mockAvailability();
    mockSupabaseClient("session-token");
    const { authenticatedApiFetch } = await apiModule();
    await authenticatedApiFetch(USER_A, "/api/profile/avatar", {
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(availability).toHaveBeenCalledOnce();
    expect(calls[0][0]).toBe("https://www.biblequest.co/api/profile/avatar");
    const init = calls[0][1]!;
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("omit");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.get("x-biblequest-expected-user")).toBe(USER_A);
    expect(headers.has("x-biblequest-web-auth")).toBe(false);
  });

  it("marks only the deterministic native account-beta API posture", async () => {
    const calls = stubFetch();
    mockAvailability();
    mockSupabaseClient("session-token");
    const { authenticatedApiFetch } = await apiModule();

    await authenticatedApiFetch(USER_A, "/api/profile/avatar");

    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.get("x-biblequest-native-account-beta")).toBe("v1");
  });

  it("pins every avatar verb and scopes cleanup to explicit account deletion", async () => {
    const calls = stubFetch((_url, init) =>
      init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : avatarResponse(),
    );
    mockAvailability();
    mockSupabaseClient("session-token");
    const {
      deleteRemoteAvatar,
      downloadRemoteAvatar,
      uploadRemoteAvatar,
    } = await import("@/lib/avatar/client");

    const expectedUser = USER_A;
    await uploadRemoteAvatar(
      expectedUser,
      new File([new Uint8Array([1])], "avatar.png", { type: "image/png" }),
    );
    await downloadRemoteAvatar(expectedUser);
    await deleteRemoteAvatar(expectedUser);
    await deleteRemoteAvatar(expectedUser, { allOwnedObjects: true });
    await deleteRemoteAvatar(expectedUser, {
      allOwnedObjects: true,
      accountDeletionCleanup: true,
    });
    await deleteRemoteAvatar(expectedUser, { accountDeletionCleanup: true });

    const headers = calls.map(([, init]) => new Headers(init?.headers));
    for (const requestHeaders of headers) {
      expect(requestHeaders.get("x-biblequest-expected-user")).toBe(
        expectedUser,
      );
    }
    expect(
      headers[4].get("x-biblequest-account-deletion-cleanup"),
    ).toBe("v1");
    for (const index of [0, 1, 2, 3, 5]) {
      expect(
        headers[index].has("x-biblequest-account-deletion-cleanup"),
      ).toBe(false);
    }
    expect(headers[0].has("content-type")).toBe(false);
  });

  it("refuses a bearer after the captured account changes", async () => {
    const calls = stubFetch(() => avatarResponse());
    mockAvailability();
    mockSupabaseClient("account-b-session-token", USER_B);
    const { downloadRemoteAvatar } = await import("@/lib/avatar/client");

    await expect(downloadRemoteAvatar(USER_A)).rejects.toMatchObject({
      code: "native_account_beta_unavailable",
    });
    expect(calls).toHaveLength(0);
  });

  it("merges with existing headers and never sets Content-Type itself", async () => {
    const calls = stubFetch();
    mockAvailability();
    mockSupabaseClient("session-token");
    const { authenticatedApiFetch } = await apiModule();
    // The avatar upload shape: FormData body, no Content-Type, so the browser
    // generates the multipart boundary.
    await authenticatedApiFetch(USER_A, "/api/profile/avatar", {
      method: "POST",
      body: new FormData(),
      headers: { "X-Custom": "kept" },
    });
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.get("x-custom")).toBe("kept");
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.has("content-type")).toBe(false);
  });

  it("replaces a caller-supplied Authorization with the exact session", async () => {
    const calls = stubFetch();
    mockAvailability();
    mockSupabaseClient("session-token");
    const { authenticatedApiFetch } = await apiModule();
    await authenticatedApiFetch(USER_A, "/api/profile/avatar", {
      headers: {
        Authorization: "Bearer caller-owned",
        "x-biblequest-web-auth": "v2",
      },
    });
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.has("x-biblequest-web-auth")).toBe(false);
  });

  it("keeps public native APIs anonymous without inspecting Keychain", async () => {
    const calls = stubFetch();
    const createClient = mockSupabaseClient("stale-session-token");
    const { apiFetch } = await apiModule();
    await apiFetch("/api/bible/chapter?book=john", {
      headers: {
        Authorization: "Bearer caller-owned",
        "x-biblequest-expected-user": USER_A,
        "x-biblequest-native-account-beta": "v1",
        "x-biblequest-web-auth": "v2",
      },
    });
    expect(createClient).not.toHaveBeenCalled();
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-biblequest-expected-user")).toBe(false);
    expect(headers.has("x-biblequest-native-account-beta")).toBe(false);
    expect(headers.has("x-biblequest-web-auth")).toBe(false);
  });

  it("degrades to no token when Supabase is unconfigured", async () => {
    const calls = stubFetch();
    mockSupabaseClient(null, USER_A, false);
    const { apiFetch } = await apiModule();
    await apiFetch("/api/bible/chapter?book=john");
    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.has("authorization")).toBe(false);
  });

  it.each([undefined, "false"])(
    "rejects authenticated native work before Keychain while account sync is %s",
    async (value) => {
      if (value === undefined) delete process.env[ACCOUNT_SYNC];
      else process.env[ACCOUNT_SYNC] = value;
      const calls = stubFetch();
      const createClient = mockSupabaseClient("stale-session-token");
      const { authenticatedApiFetch } = await apiModule();

      await expect(
        authenticatedApiFetch(USER_A, "/api/profile/avatar"),
      ).rejects.toMatchObject({ code: "native_account_beta_unavailable" });

      expect(createClient).not.toHaveBeenCalled();
      expect(calls).toHaveLength(0);
    },
  );

  it("does not inspect Keychain when the live availability probe fails", async () => {
    const calls = stubFetch();
    const availability = mockAvailability(false);
    const createClient = mockSupabaseClient("stale-session-token");
    const { authenticatedApiFetch } = await apiModule();

    await expect(
      authenticatedApiFetch(USER_A, "/api/profile/avatar"),
    ).rejects.toMatchObject({ code: "native_account_beta_unavailable" });
    expect(availability).toHaveBeenCalledOnce();
    expect(createClient).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("allows only the fixed deletion sweep while live availability is off", async () => {
    const calls = stubFetch();
    const availability = mockAvailability(false);
    mockSupabaseClient("session-token");
    const { accountDeletionAvatarFetch } = await apiModule();

    await accountDeletionAvatarFetch(USER_A);

    expect(availability).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(
      "https://www.biblequest.co/api/profile/avatar",
    );
    expect(calls[0][1]?.method).toBe("DELETE");
    expect(calls[0][1]?.body).toBe('{"allOwnedObjects":true}');
    const headers = new Headers(calls[0][1]?.headers);
    expect(headers.get("x-biblequest-expected-user")).toBe(USER_A);
    expect(headers.get("x-biblequest-account-deletion-cleanup")).toBe("v1");
    expect(headers.get("authorization")).toBe("Bearer session-token");
  });
});
