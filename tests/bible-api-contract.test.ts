import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Reads one public Bible route for static abuse-control assertions. */
function routeSource(route: string): string {
  return readFileSync(
    join(ROOT, "src", "app", "api", "bible", route, "route.ts"),
    "utf8",
  );
}

/** Finds every API route so the narrow fallback cannot spread unnoticed. */
function apiRouteFiles(directory = join(ROOT, "src", "app", "api")): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return apiRouteFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("public Bible API boundary", () => {
  it("uses the guest-read fallback only on anonymous read-only routes", () => {
    for (const route of ["chapter", "passage", "translations"]) {
      const source = routeSource(route);
      expect(source).toContain("guardProviderRequest(");
      expect(source).toContain("guardGuestBibleReadDistributedRequest(");
      expect(source.indexOf("guardProviderRequest(")).toBeLessThan(
        source.indexOf("guardGuestBibleReadDistributedRequest("),
      );
      expect(source).toContain('"Cache-Control": "private, no-store"');
    }

    const mutation = routeSource("view");
    expect(mutation).toContain("guardProviderRequest(");
    expect(mutation).toContain("guardDistributedRequest(");
    expect(mutation).not.toContain("guardGuestBibleReadDistributedRequest(");

    const fallbackRoutes = apiRouteFiles()
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "guardGuestBibleReadDistributedRequest(",
        ),
      )
      .map((path) => relative(ROOT, path))
      .sort();
    expect(fallbackRoutes).toEqual([
      "src/app/api/bible/chapter/route.ts",
      "src/app/api/bible/passage/route.ts",
      "src/app/api/bible/translations/route.ts",
    ]);
  });

  it("validates requests before claiming the shared database quota", () => {
    for (const route of ["chapter", "passage", "view"]) {
      const source = routeSource(route);
      expect(source.indexOf('{ error: "invalid_request" }')).toBeLessThan(
        source.indexOf(
          route === "view"
            ? "guardDistributedRequest("
            : "guardGuestBibleReadDistributedRequest(",
        ),
      );
    }
  });
});
