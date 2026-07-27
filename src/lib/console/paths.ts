/** Identifies the dedicated production hostname without trusting path input. */
export function isConsoleHost(host: string | null | undefined): boolean {
  const hostname = host
    ?.split(",")[0]
    .trim()
    .toLowerCase()
    .split(":")[0];
  return hostname === "console.biblequest.co";
}

/** Accepts the public host preserved by Vercel's trusted forwarding layer. */
export function isConsoleRequestHost(
  host: string | null | undefined,
  forwardedHost?: string | null,
): boolean {
  return isConsoleHost(host) || isConsoleHost(forwardedHost);
}

/** Builds clean production links while keeping local and preview routes usable. */
export function consoleHref(path: `/${string}` | "/", cleanHost: boolean) {
  if (cleanHost) return path;
  return path === "/" ? "/console" : `/console${path}`;
}

/** Maps clean console-domain URLs onto the internal Next.js route group. */
export function consoleRewritePath(
  host: string | null | undefined,
  pathname: string,
  forwardedHost?: string | null,
): string | null {
  if (
    !isConsoleRequestHost(host, forwardedHost) ||
    pathname.startsWith("/console")
  ) {
    return null;
  }

  const sharedRoute =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/og.png" ||
    /\.[a-z0-9]{2,8}$/i.test(pathname);

  if (sharedRoute) return null;
  return pathname === "/" ? "/console" : `/console${pathname}`;
}
