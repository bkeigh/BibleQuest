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
    // Keep repository-local agent worktrees outside the root lint scope. Each
    // carries its own .next build output, which would otherwise be linted.
    ".codex-worktrees/**",
    ".claude/worktrees/**",
    // The Xcode project, the staged native source copy, and the exported
    // native bundle. `cap sync` copies the whole web build into
    // ios/App/App/public/, so without this ESLint lints minified chunks.
    "ios/**",
    ".native/**",
    "out-native/**",
  ]),
]);

export default eslintConfig;
