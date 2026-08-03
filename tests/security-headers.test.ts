import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const APPROVED_FRAME_ANCESTORS = new Set([
  "'self'",
  "https://winterhill.studio",
  "https://www.winterhill.studio",
]);

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

function parseCsp(value: string) {
  const directives = new Map<string, string[]>();

  for (const rawDirective of value.split(";")) {
    const tokens = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const [name, ...sources] = tokens;
    if (directives.has(name)) {
      throw new Error(`Duplicate CSP directive: ${name}`);
    }
    directives.set(name, sources);
  }

  return directives;
}

function valuesFor(rules: HeaderRule[], key: string) {
  return rules.flatMap((rule) =>
    rule.headers
      .filter((header) => header.key.toLowerCase() === key.toLowerCase())
      .map((header) => header.value)
  );
}

// Resolves a route rule without relying on the order of unrelated cache headers.
function ruleFor(rules: HeaderRule[], source: string) {
  const rule = rules.find((candidate) => candidate.source === source);
  if (!rule) throw new Error(`Missing header rule for ${source}`);
  return rule;
}

// Reads one required header from a specific route rule.
function headerValue(rule: HeaderRule, key: string) {
  const value = rule.headers.find(
    (header) => header.key.toLowerCase() === key.toLowerCase(),
  )?.value;
  if (!value) throw new Error(`Missing ${key} on ${rule.source}`);
  return value;
}

async function headerRules(
  nodeEnv: "production" | "development",
) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://header-fixture.supabase.co",
  );
  vi.resetModules();

  const { default: nextConfig } = await import("../next.config");
  if (typeof nextConfig.headers !== "function") {
    throw new Error("next.config.ts must define production headers");
  }

  return (await nextConfig.headers()) as HeaderRule[];
}

async function productionHeaderRules() {
  return headerRules("production");
}

describe("Winterhill iframe security contract", () => {
  it("allows Winterhill only on the public homepage", async () => {
    const rules = await productionHeaderRules();
    const homepageRule = ruleFor(rules, "/");
    const privateRule = ruleFor(rules, "/:path+");
    const frameAncestors = parseCsp(
      headerValue(homepageRule, "Content-Security-Policy"),
    ).get("frame-ancestors");
    expect(frameAncestors).toBeDefined();
    expect(frameAncestors).toHaveLength(APPROVED_FRAME_ANCESTORS.size);
    expect(new Set(frameAncestors)).toEqual(APPROVED_FRAME_ANCESTORS);

    expect(
      parseCsp(headerValue(privateRule, "Content-Security-Policy")).get(
        "frame-ancestors",
      ),
    ).toEqual(["'none'"]);
    expect(headerValue(privateRule, "X-Frame-Options")).toBe("DENY");
    expect(
      homepageRule.headers.some((header) => header.key === "X-Frame-Options"),
    ).toBe(false);
  });

  it("keeps CSP and frame policy out of Vercel overrides", () => {
    const path = fileURLToPath(new URL("../vercel.json", import.meta.url));
    const vercelConfig = JSON.parse(readFileSync(path, "utf8")) as {
      headers?: Array<{ headers?: Header[] }>;
    };
    const overrideNames = (vercelConfig.headers ?? []).flatMap((rule) =>
      (rule.headers ?? []).map((header) => header.key.toLowerCase())
    );

    expect(overrideNames).not.toContain("content-security-policy");
    expect(overrideNames).not.toContain("x-frame-options");
  });
});

describe("transport and payment header scope", () => {
  it("serves HSTS while hosted billing needs no client-side origins", async () => {
    const rules = await headerRules("production");
    const policies = valuesFor(rules, "Content-Security-Policy");
    const csp = parseCsp(
      headerValue(ruleFor(rules, "/"), "Content-Security-Policy"),
    );

    expect(new Set(valuesFor(rules, "Strict-Transport-Security"))).toEqual(
      new Set(["max-age=15552000"]),
    );
    expect(csp.get("script-src")).not.toContain("https://tally.so");
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
    expect(csp.get("connect-src")).toContain(
      "https://header-fixture.supabase.co",
    );
    expect(csp.get("frame-src")).toEqual(["'self'", "https://tally.so"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(policies[0]).not.toContain("api.rc-backup.com");
    expect(policies[0]).not.toContain("revenuecat.com");
    expect(policies[0]).not.toContain("stripe.com");
    expect(policies[0]).not.toContain("link.com");
    expect(policies[0]).not.toContain("https://*.supabase.co");
    expect(policies[0]).not.toContain("wss://*.supabase.co");
    expect(valuesFor(rules, "Permissions-Policy")[0]).toContain("payment=()");
  });

  it("keeps HSTS out of development and scopes unsafe-eval to development", async () => {
    const rules = await headerRules("development");
    const csp = parseCsp(
      headerValue(ruleFor(rules, "/"), "Content-Security-Policy"),
    );

    expect(valuesFor(rules, "Strict-Transport-Security")).toEqual([]);
    expect(csp.get("script-src")).toContain("'unsafe-eval'");
    expect(csp.has("upgrade-insecure-requests")).toBe(false);
  });

  it("keeps all billing origins out of the BibleQuest document policy", async () => {
    const rules = await headerRules("production");
    const policies = valuesFor(rules, "Content-Security-Policy");
    const csp = parseCsp(
      headerValue(ruleFor(rules, "/"), "Content-Security-Policy"),
    );

    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.get("frame-src")).toEqual(["'self'", "https://tally.so"]);
    expect(policies[0]).not.toMatch(/revenuecat|stripe|link\.com/i);
  });
});
