/**
 * Shape gate for a native bearer `Authorization` header.
 *
 * Deliberately NOT the RFC 6750 `b64token` charset: that permits `+` and `/`
 * (not base64url) and permits zero dots, none of which a GoTrue JWS compact
 * serialization can contain. The anchored three-segment check also fails
 * closed on the `", "`-joined value `Headers.get` returns when a request
 * smuggles duplicate Authorization headers.
 *
 * This is a cheap gate, not verification. `getUser(token)` is the
 * verification — a real network round-trip checking signature, expiry and
 * revocation. The length bound is a DoS gate only; Supabase access tokens run
 * 1–2 KB today, so 4096 leaves ample headroom while an outgrown token would
 * fail closed here (401) rather than reach the verifier.
 */

const MAX_HEADER_LENGTH = 4096;
const BEARER_JWT =
  /^Bearer +([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

/** Returns the token when the header is exactly one bearer-shaped JWT. */
export function parsedBearerToken(header: string | null): string | null {
  if (!header || header.length > MAX_HEADER_LENGTH) return null;
  const match = BEARER_JWT.exec(header);
  return match ? match[1] : null;
}
