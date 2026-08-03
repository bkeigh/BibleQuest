import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Plus AI API boundary", () => {
  const questRoute = readFileSync("src/app/api/ai/quest/route.ts", "utf8");
  const shepherdRoute = readFileSync(
    "src/app/api/ai/shepherd/route.ts",
    "utf8",
  );
  const provider = readFileSync("src/lib/ai/anthropic.server.ts", "utf8");

  it("authenticates Plus and checks same-origin before every model call", () => {
    for (const route of [questRoute, shepherdRoute]) {
      expect(route).toContain("hasSameOrigin(request)");
      expect(route).toContain("requireServerPlus()");
      // Identity-scoped: a metered provider budget belongs to the account, so
      // the bucket must not reset when the caller's IP changes.
      expect(route).toContain("guardIdentifiedRequest(");
      expect(route).toContain("guardDistributedRequest(");
      expect(route).toContain("entitlement.userId");
      expect(route).toContain(
        "boundedJson(request, AI_REQUEST_MAX_BYTES)",
      );
      expect(route).not.toContain("request.json()");
      expect(route).toContain('"Cache-Control": "private, no-store"');
    }
  });

  it("keeps the key in a server-only module and pins Haiku 4.5", () => {
    expect(provider).toContain('import "server-only"');
    expect(provider).toContain("process.env.ANTHROPIC_API_KEY");
    expect(provider).toContain("claude-haiku-4-5-20251001");
    expect(provider).not.toContain("NEXT_PUBLIC_ANTHROPIC");
  });

  it("sends no journals, prayers, profiles, or chat history", () => {
    const combined = `${questRoute}\n${shepherdRoute}\n${provider}`;
    expect(combined).not.toContain("@/lib/questos/store");
    expect(combined).not.toContain("journal");
    expect(combined).not.toContain("reflection");
    expect(provider).toContain("myShepherdPrompt(question, currentPath)");
    expect(provider).not.toContain("conversationHistory");
  });
});
