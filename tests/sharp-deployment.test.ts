import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Sharp deployment packaging", () => {
  // The route trace retains Linux binaries but avoids pnpm symlink directories.
  it("includes the complete Linux runtime in the avatar function", async () => {
    const { default: nextConfig } = await import("../next.config");
    const includes = nextConfig.outputFileTracingIncludes?.[
      "/api/profile/avatar"
    ] as string[] | undefined;

    expect(includes).toEqual([
      "./node_modules/@img/sharp-linux-x64/index.cjs",
      "./node_modules/@img/sharp-linux-x64/lib/*.node",
      "./node_modules/@img/sharp-linux-x64/package.json",
      "./node_modules/@img/sharp-libvips-linux-x64/lib/index.js",
      "./node_modules/@img/sharp-libvips-linux-x64/lib/*.so.*",
      "./node_modules/@img/sharp-libvips-linux-x64/package.json",
      "./node_modules/@img/sharp-libvips-linux-x64/versions.json",
    ]);
  });

  // Cross-platform installs must materialize Linux x64 optional dependencies.
  it("keeps Linux x64 in pnpm supported architectures", () => {
    const path = fileURLToPath(
      new URL("../pnpm-workspace.yaml", import.meta.url)
    );
    const workspace = readFileSync(path, "utf8");

    expect(workspace).toMatch(
      /supportedArchitectures:\s+os:\s+- current\s+- linux\s+cpu:\s+- current\s+- x64\s+libc:\s+- current\s+- glibc/
    );
  });
});
