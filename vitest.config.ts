import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/fixtures/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // Component cases opt into jsdom per file with a
    // `@vitest-environment jsdom` docblock, so the rest of the suite keeps the
    // faster node environment.
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "tests/apple-client-secret.test.mjs",
      "tests/observability-evidence.test.mjs",
    ],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
    },
    clearMocks: true,
    restoreMocks: true,
  },
});
