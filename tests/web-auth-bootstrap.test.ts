import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  decideMissingWebAuthRecovery,
  decideWebAuthBootstrap,
} from "@/lib/supabase/useSession";
import type { WebAuthState } from "@/lib/supabase/web-auth-storage";

const USER_A = "10000000-0000-4000-8000-000000000001";

/** Builds one retained v2 session for reload-decision fixtures. */
function retainedSession(): Session {
  const payload = Buffer.from(
    JSON.stringify({ sub: USER_A, session_id: "lineage-a" }),
  ).toString("base64url");
  return {
    access_token: `fixture.${payload}.signature`,
    refresh_token: "refresh-a",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: USER_A,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-08-14T00:00:00.000Z",
    },
  } as Session;
}

/** Wraps one session in the exact durable state read during a fresh load. */
function retainedState(
  mode: "installing" | "active" | "deleting" | "signing-out",
): WebAuthState {
  const session = retainedSession();
  return {
    status: "stored",
    mode,
    session,
    sessionId: "lineage-a",
    credential: {
      userId: USER_A,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    },
  };
}

describe("v2 web auth reload decisions", () => {
  it("resumes a marked deletion while the identity or deletion latch exists", () => {
    const state = retainedState("deleting");

    expect(decideWebAuthBootstrap(state, "active").action).toBe(
      "resume-deletion",
    );
    expect(decideWebAuthBootstrap(state, "pending").action).toBe(
      "resume-deletion",
    );
  });

  it("runs device-only deletion cleanup only after exact identity absence", () => {
    expect(
      decideWebAuthBootstrap(retainedState("deleting"), "deleted").action,
    ).toBe("purge-deleted");
    expect(
      decideWebAuthBootstrap(retainedState("deleting"), "revoked").action,
    ).toBe("closed");
  });

  it("resumes marked sign-out and never routes it through journey purge", () => {
    const state = retainedState("signing-out");

    expect(decideWebAuthBootstrap(state, "active").action).toBe(
      "resume-sign-out",
    );
    expect(decideWebAuthBootstrap(state, "revoked").action).toBe(
      "finish-sign-out",
    );
    expect(decideWebAuthBootstrap(state, "deleted").action).toBe(
      "finish-sign-out",
    );
  });

  it("keeps malformed, ambiguous, and deletion-pending sign-out closed", () => {
    expect(
      decideWebAuthBootstrap({ status: "unavailable" }).action,
    ).toBe("closed");
    expect(
      decideWebAuthBootstrap(retainedState("signing-out"), "unavailable")
        .action,
    ).toBe("closed");
    expect(
      decideWebAuthBootstrap(retainedState("signing-out"), "pending").action,
    ).toBe("closed");
  });

  it("accepts an active state but treats a genuinely missing slot as guest", () => {
    expect(decideWebAuthBootstrap(retainedState("active")).action).toBe(
      "accept-active",
    );
    expect(decideWebAuthBootstrap({ status: "missing" }).action).toBe(
      "signed-out",
    );
  });

  it("turns sign-out reload with an owned journey into locked recovery", () => {
    expect(
      decideMissingWebAuthRecovery({ status: "owned", userId: USER_A }),
    ).toBe("locked");
    expect(decideMissingWebAuthRecovery({ status: "unowned" })).toBe("guest");
    expect(
      decideMissingWebAuthRecovery({ status: "unavailable", reason: "storage" }),
    ).toBe("closed");
    expect(decideWebAuthBootstrap(retainedState("installing")).action).toBe(
      "closed",
    );
  });
});
