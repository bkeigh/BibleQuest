import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-header-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Keep repository-local Codex worktrees outside the root lint scope.
    ".codex-worktrees/**",
  ]),
]);

export default eslintConfig;
