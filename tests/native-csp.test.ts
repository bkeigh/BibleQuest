import { describe, expect, it } from "vitest";
import {
  nativeContentSecurityPolicy,
  nativeContentSecurityPolicyFromEnv,
} from "@/lib/security/csp";

function directiveNames(policy: string): string[] {
  return policy
    .split(";")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .sort();
}

function directive(policy: string, name: string): string | undefined {
  return policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

/**
 * The web policy lives in next.config.ts as a response header. The native
 * bundle cannot send headers, so it carries its own meta-tag policy. These two
 * are built in separate places on purpose — next.config.ts imports nothing from
 * src/ and the web build must stay byte-identical — so this test is what keeps
 * them from drifting apart.
 */
async function webPolicy(): Promise<string> {
  const { default: config } = await import("../next.config");
  const groups = await config.headers!();
  for (const group of groups) {
    for (const header of group.headers) {
      if (header.key === "Content-Security-Policy") return header.value;
    }
  }
  throw new Error("next.config.ts emitted no Content-Security-Policy header");
}

describe("native content security policy", () => {
  it("covers every directive the web policy sets, minus the two a meta tag cannot carry", async () => {
    const web = directiveNames(await webPolicy());
    const native = directiveNames(nativeContentSecurityPolicy());

    // `frame-ancestors` is invalid in a meta tag; `upgrade-insecure-requests`
    // is meaningless for filesystem-served assets.
    const expected = web.filter(
      (name) =>
        name !== "frame-ancestors" && name !== "upgrade-insecure-requests",
    );

    expect(native).toEqual(expect.arrayContaining(expected));
  });

  it("omits the two directives that cannot work in a local bundle", () => {
    const policy = nativeContentSecurityPolicy();
    expect(policy).not.toContain("frame-ancestors");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("names remote origins explicitly, because 'self' is the bundle", () => {
    const policy = nativeContentSecurityPolicy({
      supabaseOrigin: "https://project.supabase.co",
      hostedOrigin: "https://www.biblequest.co",
    });
    expect(directive(policy, "connect-src")).toBe(
      "connect-src 'self' https://project.supabase.co https://www.biblequest.co",
    );
  });

  it("drops decorated or non-HTTPS origins rather than trusting them", () => {
    for (const bad of [
      "http://insecure.example",
      "https://user:pw@example.com",
      "https://example.com/path",
      "https://example.com/?a=1",
      "not a url",
    ]) {
      process.env.NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN = bad;
      expect(directive(nativeContentSecurityPolicyFromEnv(), "connect-src")).toBe(
        "connect-src 'self'",
      );
    }
    delete process.env.NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN;
  });

  it("blocks plugins and third-party frames outright", () => {
    const policy = nativeContentSecurityPolicy();
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "frame-src")).toBe("frame-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
  });
});
