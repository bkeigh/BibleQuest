/**
 * Validate the single external destination used by the support redirect.
 * Stripe Payment Links are public by design, but the value remains server-only
 * so deploy configuration cannot accidentally leak into a client bundle.
 */
export function parseStripeDonationUrl(raw: string | undefined): URL | null {
  if (!raw || raw !== raw.trim() || raw.length > 2048) return null;

  try {
    const url = new URL(raw);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "buy.stripe.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      pathParts.length !== 1 ||
      !/^[A-Za-z0-9_]+$/.test(pathParts[0])
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
