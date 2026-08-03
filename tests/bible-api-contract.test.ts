import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Reads one public Bible route for static abuse-control assertions. */
function routeSource(route: string): string {
  return readFileSync(
    join(ROOT, "src", "app", "api", "bible", route, "route.ts"),
    "utf8",
  );
}

describe("public Bible API boundary", () => {
  it("layers local and distributed quotas around every provider-facing route", () => {
    for (const route of ["chapter", "passage", "translations", "view"]) {
      const source = routeSource(route);
      expect(source).toContain("guardProviderRequest(");
      expect(source).toContain("guardDistributedRequest(");
      expect(source).toContain('"Cache-Control": "private, no-store"');
    }
  });

  it("validates requests before claiming the shared database quota", () => {
    for (const route of ["chapter", "passage", "view"]) {
      const source = routeSource(route);
      expect(source.indexOf('{ error: "invalid_request" }')).toBeLessThan(
        source.indexOf("guardDistributedRequest("),
      );
    }
  });
});
