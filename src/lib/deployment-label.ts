export const SYNC_STAGING_DEPLOYMENT_LABEL =
  "SYNC-ENABLED STAGING — NEVER PROMOTE";

// Shows the warning only for the exact reviewed staging label.
export function deploymentLabel(value: string | undefined): string | null {
  return value === SYNC_STAGING_DEPLOYMENT_LABEL
    ? SYNC_STAGING_DEPLOYMENT_LABEL
    : null;
}
