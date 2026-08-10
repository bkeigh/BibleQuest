import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/app/api/profile/avatar/route.ts",
  "utf8",
);

describe("avatar API resource limits", () => {
  it("claims local and distributed account capacity before image decoding", () => {
    const localGuard = route.indexOf("guardIdentifiedRequest(");
    const distributedGuard = route.indexOf("guardDistributedRequest(");
    const decode = route.indexOf("normalizeAvatarImage(");

    expect(localGuard).toBeGreaterThan(-1);
    expect(distributedGuard).toBeGreaterThan(localGuard);
    expect(decode).toBeGreaterThan(distributedGuard);
    expect(route).toContain("`avatar-upload:${user.id}`");
    expect(route).toContain("AVATAR_UPLOAD_RATE_POLICIES");
  });
});
