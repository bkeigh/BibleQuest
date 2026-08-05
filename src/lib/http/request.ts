import { isNativeAppOrigin } from "./native-origin";

/** Requires browser mutations to originate from the exact request origin. */
export function hasSameOrigin(request: Request): boolean {
  // The iOS bundle is a legitimate caller from a different origin. This is an
  // ADDITIONAL allow placed above the existing checks, never a relaxation of
  // them: every rejection below still applies to every other caller, and the
  // allowance is inert unless its server-only latch is on. Passing here is not
  // authentication — it only lets the request reach the real identity check.
  if (isNativeAppOrigin(request)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const claimed = new URL(origin);
    if (
      (claimed.protocol !== "http:" && claimed.protocol !== "https:") ||
      claimed.username ||
      claimed.password
    ) {
      return false;
    }
    const claimedOrigin = claimed.origin;
    const internalOrigin = new URL(request.url);
    if (claimedOrigin === internalOrigin.origin) return true;

    // Next/Vercel may construct request.url from an internal proxy hostname.
    // The browser-facing Host plus forwarded protocol is the comparison edge.
    const host = request.headers.get("host");
    if (!host || /[/\\\s@]/.test(host)) return false;
    const forwardedProtocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    const protocol =
      forwardedProtocol === "http" || forwardedProtocol === "https"
        ? forwardedProtocol
        : internalOrigin.protocol.slice(0, -1);
    return claimedOrigin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

/** Returns a bounded JSON error without reflecting private provider details. */
export function privateError(code: string, status: number): Response {
  return Response.json(
    { error: code },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
