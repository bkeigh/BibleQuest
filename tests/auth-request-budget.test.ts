import { describe, expect, it } from "vitest";
import {
  AUTH_REQUEST_DEADLINE_MS,
  WEB_AUTH_INTERACTIVE_LOCK_TIMEOUT_MS,
  WEB_AUTH_SERVICE_WORKER_CONTROLLER_TIMEOUT_MS,
  WEB_AUTH_SERVICE_WORKER_RESULT_TIMEOUT_MS,
} from "@/lib/auth/request-budget";

describe("interactive web-auth time budgets", () => {
  it("finishes every inner browser gate before the outer request deadline", () => {
    // The lock and worker checks must leave a useful window for Supabase itself.
    const attestationTimeout =
      WEB_AUTH_SERVICE_WORKER_CONTROLLER_TIMEOUT_MS +
      WEB_AUTH_SERVICE_WORKER_RESULT_TIMEOUT_MS;
    // The worker waits 2s for silent sibling tabs before posting its result.
    expect(WEB_AUTH_SERVICE_WORKER_RESULT_TIMEOUT_MS).toBeGreaterThan(2_000);
    expect(
      WEB_AUTH_INTERACTIVE_LOCK_TIMEOUT_MS +
        attestationTimeout,
    ).toBeLessThan(AUTH_REQUEST_DEADLINE_MS);
    expect(
      AUTH_REQUEST_DEADLINE_MS -
        WEB_AUTH_INTERACTIVE_LOCK_TIMEOUT_MS -
        attestationTimeout,
    ).toBeGreaterThanOrEqual(4_000);
  });
});
