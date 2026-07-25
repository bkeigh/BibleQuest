import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Sharp deployment packaging", () => {
  // The avatar function includes only the shared library missing from tracing.
  it("adds the Linux libvips shared library without package directories", async () => {
    const { default: nextConfig } = await import("../next.config");

    expect(
      nextConfig.outputFileTracingIncludes?.["/api/profile/avatar"]
    ).toEqual([
      "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/*.so.*",
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
