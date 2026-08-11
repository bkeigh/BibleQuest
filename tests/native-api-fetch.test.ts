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
  vi.unstubAllGlobals();
});

describe("apiFetch on the web target", () => {
  it("passes the caller's init through by reference with no token", async () => {
    const calls = stubFetch();
    const { apiFetch } = await apiModule();
    const init = { method: "POST", credentials: "same-origin" as const };
    await apiFetch("/api/arcade/status", init);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("/api/arcade/status");
    // Identity, not equality: web behavior is byte-identical to before.
    expect(calls[0][1]).toBe(init);
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
      headers: { Authorization: "Bearer caller-owned" },
    });
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer session-token");
  });

  it("pins a billing bearer to the expected verified account", async () => {
    const calls = stubFetch();
    mockAvailability();
    mockSupabaseClient("session-token");
    const { apiFetch, nativeSessionMatches } = await apiModule();

    await expect(
      apiFetch("/api/billing/checkout", { method: "POST" }, USER_A),
    ).resolves.toHaveProperty("status", 204);
    expect(calls).toHaveLength(1);
    expect(
      new Headers(calls[0][1]?.headers).get("authorization"),
    ).toBe("Bearer session-token");
    await expect(nativeSessionMatches(USER_A)).resolves.toBe(true);
  });

  it("rejects a changed account before sending a pinned billing request", async () => {
    const calls = stubFetch();
    mockAvailability();
    mockSupabaseClient("different-session-token", USER_B);
    const { apiFetch, nativeSessionMatches } = await apiModule();

    await expect(
      apiFetch("/api/billing/checkout", { method: "POST" }, USER_A),
    ).rejects.toMatchObject({ code: "native_account_beta_unavailable" });
    expect(calls).toHaveLength(0);
    await expect(nativeSessionMatches(USER_A)).resolves.toBe(false);
  });

  it("replaces a caller bearer when pinning a billing account", async () => {
    const calls = stubFetch();
    mockAvailability();
    mockSupabaseClient("session-token");
    const { apiFetch } = await apiModule();

    await expect(
      apiFetch(
        "/api/billing/checkout",
        { headers: { Authorization: "Bearer caller-owned" } },
        USER_A,
      ),
    ).resolves.toHaveProperty("status", 204);
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0][1]?.headers).get("authorization")).toBe(
      "Bearer session-token",
    );
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
      },
    });
    expect(createClient).not.toHaveBeenCalled();
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-biblequest-expected-user")).toBe(false);
    expect(headers.has("x-biblequest-native-account-beta")).toBe(false);
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
