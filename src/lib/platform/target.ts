/**
 * The build target, readable from anywhere without throwing.
 *
 * `platformRuntime()` in ./runtime.ts is the full boundary: it validates the
 * hosted origin and throws `PlatformConfigurationError` when a native build is
 * misconfigured. That is the right behaviour for anything that needs the
 * origin, and the wrong behaviour for render paths and link builders, where an
 * exception is far worse than a degraded result.
 *
 * This helper answers only "which build is this?", which never fails.
 * `NEXT_PUBLIC_*` is inlined at build time, so calls fold to a constant and the
 * unused branch is eliminated from each bundle.
 */
export function isNativeTarget(): boolean {
  return process.env.NEXT_PUBLIC_APP_PLATFORM?.trim() === "native";
}
