/**
 * A sign-in link or OAuth round trip that finishes in a different browser than
 * it started in can never complete: PKCE keeps its verifier in the originating
 * browser. That happens constantly in real use — links opened from Instagram,
 * Gmail, or any in-app browser land somewhere else.
 *
 * The app already writes the exact guidance for it (`browser_mismatch`:
 * "open it in the same browser where you started"), but the reason was
 * discarded twice before it could be used: `completeVerifiedWebOAuth` threw a
 * bare `WebAuthUnavailableError`, and the callback ignored even that. Everyone
 * got "That sign-in link is incomplete or invalid" instead, which points at
 * the link rather than at the thing that actually helps.
 *
 * Reported 2026-08-15, when a Google sign-in succeeded completely at the
 * provider — last_sign_in_at was updated — and the app still reported the link
 * invalid.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authFailureMessage, authFailureReason } from "@/lib/auth/errors";
import { WebOAuthCompletionError } from "@/lib/supabase/web-auth-storage";

describe("browser OAuth completion failures", () => {
  it("keeps the provider's reason instead of collapsing it", () => {
    for (const code of ["bad_code_verifier", "flow_state_not_found"]) {
      const error = new WebOAuthCompletionError({ code });
      expect(error.providerCode).toBe(code);
      expect(authFailureReason(error, error.providerCode)).toBe(
        "browser_mismatch",
      );
    }
  });

  it("tells someone the one thing that actually resolves it", () => {
    const message = authFailureMessage("browser_mismatch");

    expect(message).toMatch(/same browser/i);
    // The old copy blamed the link, which sent people requesting fresh ones
    // forever and never mentioned the browser.
    expect(message).not.toMatch(/incomplete or invalid/i);
  });

  it("still reads as unavailable to existing callers", async () => {
    const { WebAuthUnavailableError } = await import(
      "@/lib/supabase/web-auth-storage"
    );

    // Subclassing keeps every existing `instanceof` guard working.
    expect(new WebOAuthCompletionError({ code: "bad_code_verifier" })).toBeInstanceOf(
      WebAuthUnavailableError,
    );
  });

  it("throws the carrying error at the exchange, not a bare one", () => {
    // The cases above exercise the error class, which stays green even if the
    // call site goes back to discarding the cause — verified by mutation. The
    // exchange builds its own client, so this pins the call site at the source
    // instead, the way the iOS release config tests pin their shell script.
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/supabase/web-auth-storage.ts"),
      "utf8",
    );
    const exchange = source.indexOf("exchange.auth.exchangeCodeForSession");
    expect(exchange).toBeGreaterThan(-1);

    // Scope to the result-error branch only. A later branch throws a bare
    // WebAuthUnavailableError legitimately, for a failed install rather than a
    // failed exchange, and must not be dragged into this assertion.
    const branch = source.indexOf(
      "if (result.error || !result.data.session)",
      exchange,
    );
    expect(branch).toBeGreaterThan(exchange);
    const body = source.slice(branch, source.indexOf("\n  }", branch));

    expect(body).toContain("throw new WebOAuthCompletionError(result.error)");
    expect(body).not.toContain("throw new WebAuthUnavailableError()");
  });

  it("survives a cause that carries no usable code", () => {
    for (const cause of [null, undefined, {}, { code: 42 }, "boom"]) {
      const error = new WebOAuthCompletionError(cause);
      expect(error.providerCode).toBeNull();
      // Unknown stays unknown rather than being asserted as a browser problem.
      expect(authFailureReason(error, error.providerCode)).toBe("unknown");
    }
  });
});
