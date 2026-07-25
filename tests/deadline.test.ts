import { describe, expect, it, vi } from "vitest";
import { DeadlineError, withDeadline } from "@/lib/async/deadline";

describe("bounded browser operations", () => {
  it("returns values that settle before the deadline", async () => {
    await expect(
      withDeadline(Promise.resolve("ready"), 100, "Fixture"),
    ).resolves.toBe("ready");
  });

  it("rejects stalled operations with a classifiable error", async () => {
    vi.useFakeTimers();
    const stalled = new Promise<never>(() => undefined);
    const result = withDeadline(stalled, 50, "Fixture");
    const assertion = expect(result).rejects.toMatchObject({
      name: "DeadlineError",
      code: "request_timeout",
    });

    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(new DeadlineError("Fixture").code).toBe("request_timeout");
    vi.useRealTimers();
  });
});
