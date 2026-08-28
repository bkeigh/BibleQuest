import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads source directly because the contract is the focus-only utility that
// prevents each skip link from appearing beneath a native status area.
function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("skip-link safe-area placement", () => {
  it.each([
    "src/components/app-shell/AppShell.tsx",
    "src/app/(marketing)/layout.tsx",
  ])("keeps the focused link below the top safe area in %s", (path) => {
    expect(source(path)).toContain(
      "focus:top-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))]",
    );
  });
});
