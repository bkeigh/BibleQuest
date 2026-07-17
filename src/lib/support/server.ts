import "server-only";

import { parseStripeDonationUrl } from "./config";

/** Read lazily so builds without payment configuration remain fully usable. */
export function getStripeDonationUrl(): URL | null {
  return parseStripeDonationUrl(process.env.STRIPE_DONATION_URL);
}

export function isStripeDonationConfigured(): boolean {
  return getStripeDonationUrl() !== null;
}
