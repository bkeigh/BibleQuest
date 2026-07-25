import { describe, expect, it } from "vitest";
import {
  deploymentLabel,
  SYNC_STAGING_DEPLOYMENT_LABEL,
} from "@/lib/deployment-label";

describe("deployment label", () => {
  // The exact reviewed value shows the staging warning.
  it("accepts the sync-enabled staging label", () => {
    expect(deploymentLabel(SYNC_STAGING_DEPLOYMENT_LABEL)).toBe(
      SYNC_STAGING_DEPLOYMENT_LABEL
    );
  });

  // Missing, approximate, or production-like values stay invisible.
  it.each([
    undefined,
    "",
    "SYNC-ENABLED STAGING",
    "SYNC-ENABLED STAGING — NEVER PROMOTE ",
    "Production",
  ])("rejects %s", (value) => {
    expect(deploymentLabel(value)).toBeNull();
  });
});
