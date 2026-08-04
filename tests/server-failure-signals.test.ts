import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyServerFailure,
  recordServerFailure,
  recordServerFailureReason,
  safeServerFailureLog,
  SERVER_FAILURE_REASONS,
} from "@/lib/observability/server-failures";
import { DistributedRateLimitError } from "@/lib/security/distributed-rate-limit.server";

const PRIVATE_MARKERS = [
  "fixture prayer",
  "Ada Person",
  "ada@example.test",
  "secret-token",
  "sk_live_fixture",
  "https://evil.example/path?token=secret",
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("privacy-safe server failure signals", () => {
  it("records only bounded enums and never the provider's own text", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const providerError = Object.assign(
      new Error(PRIVATE_MARKERS.join(" | ")),
      { status: 502, code: PRIVATE_MARKERS[3] },
    );

    recordServerFailure("billing", "checkout", providerError);
    recordServerFailureReason("push", "test_delivery", "provider");

    expect(errorLog).toHaveBeenCalledTimes(2);
    const written = errorLog.mock.calls.flat().join(" ");
    for (const marker of PRIVATE_MARKERS) {
      expect(written).not.toContain(marker);
    }
    expect(JSON.parse(errorLog.mock.calls[0][0] as string)).toEqual({
      kind: "server_failure",
      surface: "billing",
      stage: "checkout",
      reason: "provider",
    });
    expect(JSON.parse(errorLog.mock.calls[1][0] as string)).toEqual({
      kind: "server_failure",
      surface: "push",
      stage: "test_delivery",
      reason: "provider",
    });
  });

  it("reconstructs the log from fixed enums and rejects unknown members", () => {
    expect(
      safeServerFailureLog("bible", "passage", "rate_limited"),
    ).toEqual({
      kind: "server_failure",
      surface: "bible",
      stage: "passage",
      reason: "rate_limited",
    });
    expect(
      safeServerFailureLog(PRIVATE_MARKERS[1], PRIVATE_MARKERS[2], {
        reason: PRIVATE_MARKERS[3],
      }),
    ).toEqual({
      kind: "server_failure",
      surface: "unknown",
      stage: "unknown",
      reason: "unknown",
    });
  });

  it("separates configuration, dependency, and provider causes", () => {
    expect(
      classifyServerFailure(
        Object.assign(new Error("boom"), { name: "AiConfigurationError" }),
      ),
    ).toBe("configuration");
    expect(
      classifyServerFailure(Object.assign(new Error("boom"), { code: "42P01" })),
    ).toBe("schema");
    expect(
      classifyServerFailure(Object.assign(new Error("boom"), { status: 429 })),
    ).toBe("rate_limited");
    expect(
      classifyServerFailure(
        Object.assign(new Error("boom"), { name: "AbortError" }),
      ),
    ).toBe("timeout");
    expect(classifyServerFailure(new TypeError("fetch failed"))).toBe(
      "dependency",
    );
    expect(classifyServerFailure(new Error("boom"))).toBe("unknown");
    expect(classifyServerFailure(undefined)).toBe("unknown");
  });

  it("follows a wrapped cause and a reviewed reason instead of losing it", () => {
    expect(
      classifyServerFailure(
        new Error("avatar profile unavailable", {
          cause: Object.assign(new Error(PRIVATE_MARKERS[0]), {
            code: "42501",
          }),
        }),
      ),
    ).toBe("permission");
    expect(classifyServerFailure(new DistributedRateLimitError("configuration"))).toBe(
      "configuration",
    );
    expect(classifyServerFailure(new DistributedRateLimitError("dependency"))).toBe(
      "dependency",
    );
    // A cycle must terminate rather than exhaust the stack.
    const looping = new Error("boom");
    Object.defineProperty(looping, "cause", { value: looping });
    expect(SERVER_FAILURE_REASONS).toContain(classifyServerFailure(looping));
  });
});
