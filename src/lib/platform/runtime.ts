/** The web target remains the default until a separately reviewed native build exists. */
export type PlatformTarget = "web" | "native";

export interface PlatformRuntime {
  target: PlatformTarget;
  /** Native bundles use the hosted HTTPS application as their API and public-link origin. */
  hostedOrigin?: string;
}

export interface PlatformEnvironment {
  appPlatform?: string;
  nativeHostedOrigin?: string;
}

export class PlatformConfigurationError extends Error {
  constructor() {
    super("BibleQuest platform configuration is unavailable.");
    this.name = "PlatformConfigurationError";
  }
}

/** Reads only explicitly public build settings; no credential belongs in this boundary. */
export function currentPlatformEnvironment(): PlatformEnvironment {
  return {
    appPlatform: process.env.NEXT_PUBLIC_APP_PLATFORM,
    nativeHostedOrigin: process.env.NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN,
  };
}

/** Accepts one exact HTTPS origin and rejects paths, credentials, and URL decorations. */
export function validatedHostedOrigin(value: string | undefined): string {
  if (!value) throw new PlatformConfigurationError();

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new PlatformConfigurationError();
    }
    return url.origin;
  } catch (error) {
    if (error instanceof PlatformConfigurationError) throw error;
    throw new PlatformConfigurationError();
  }
}

/** Fails closed on unknown targets and requires a hosted origin for native bundles. */
export function platformRuntime(
  environment: PlatformEnvironment = currentPlatformEnvironment(),
): PlatformRuntime {
  const target = environment.appPlatform?.trim() || "web";
  if (target === "web") return { target: "web" };
  if (target !== "native") throw new PlatformConfigurationError();
  return {
    target: "native",
    hostedOrigin: validatedHostedOrigin(environment.nativeHostedOrigin),
  };
}
