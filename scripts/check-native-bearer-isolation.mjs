#!/usr/bin/env node

/**
 * Proves the native bearer transport separates two real accounts end to end.
 *
 * The unit suite mocks token verification, and 15 of the 16 authenticated
 * surfaces have no RLS backstop — a service-role client keyed on the resolved
 * user id is the only separation — so the bearer path's identity resolution
 * must be verified against a deployed target with real tokens, per the Phase
 * 4b handoff's definition of done. This script creates two disposable staging
 * users, grants one a REAL operator Plus entitlement, and sends both bearer
 * tokens with `Origin: capacitor://localhost` against a latch-enabled
 * deployment: each token must resolve to exactly its own account (billing
 * projection and all three avatar handlers), and broken tokens must fail
 * closed. Both users and every fixture are deleted afterwards.
 *
 * Requirements on the target deployment (a Vercel Preview, never production):
 *   - BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED=true (scoped to that environment)
 *   - BIBLEQUEST_AVATAR_SYNC_ENABLED=true (the avatar surface is the one that
 *     breaks silently under a verify-only bearer design, so it is mandatory)
 *   - NEXT_PUBLIC_SUPABASE_URL pointing at the SAME staging project this
 *     script signs its actors into.
 */
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const CONFIRMATION = "staging-only-native-bearer-isolation";
const NATIVE_ORIGIN = "capacitor://localhost";

/**
 * The one biblequest.co host this probe may target.
 *
 * Vercel Authentication protects every deployment except those reached through
 * a custom domain, and the iOS WebView cannot satisfy an SSO redirect — so the
 * native staging target is a custom subdomain rather than a *.vercel.app
 * preview URL. A source constant, never an environment variable: the apex,
 * www, and every other production alias stay refused below, so no environment
 * setting can widen this probe onto production.
 */
const ALLOWED_STAGING_HOST = "native-staging.biblequest.co";
const REQUIRED_ENV = [
  "BIBLEQUEST_STAGING_PROJECT_REF",
  "BIBLEQUEST_CONFIRM_NATIVE_BEARER_TEST",
  "BIBLEQUEST_NATIVE_BEARER_TARGET_ORIGIN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

// A 96x96 lossless WebP (solid green), generated with this repo's own sharp —
// large enough for MIN_AVATAR_SOURCE_EDGE and tiny enough to inline.
const AVATAR_FIXTURE_BASE64 =
  "UklGRiQAAABXRUJQVlA4TBcAAAAvX8AXAAfQqTqUp/9hABLC//1SRP9TPwA=";

/** Stops before any mutation when the staging-only safety contract is absent. */
function requireEnvironment() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment: ${missing.join(", ")}`);
  }
  if (process.env.BIBLEQUEST_CONFIRM_NATIVE_BEARER_TEST !== CONFIRMATION) {
    throw new Error(
      `Set BIBLEQUEST_CONFIRM_NATIVE_BEARER_TEST=${CONFIRMATION}`,
    );
  }

  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const expectedHost = `${process.env.BIBLEQUEST_STAGING_PROJECT_REF}.supabase.co`;
  if (url.protocol !== "https:" || url.hostname !== expectedHost) {
    throw new Error(
      `Refusing non-staging target; expected https://${expectedHost}`,
    );
  }

  const target = new URL(process.env.BIBLEQUEST_NATIVE_BEARER_TARGET_ORIGIN);
  if (
    target.protocol !== "https:" ||
    target.origin !== process.env.BIBLEQUEST_NATIVE_BEARER_TARGET_ORIGIN ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      "BIBLEQUEST_NATIVE_BEARER_TARGET_ORIGIN must be a bare HTTPS origin",
    );
  }
  if (
    target.hostname !== ALLOWED_STAGING_HOST &&
    (target.hostname === "biblequest.co" ||
      target.hostname.endsWith(".biblequest.co"))
  ) {
    throw new Error("Refusing to probe production or any production alias");
  }
  return target.origin;
}

/** Raises one sanitized failure without exposing fixture values or identities. */
function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Converts a Supabase result into a sanitized hard failure. */
function requireResult(result, operation) {
  if (result.error) {
    throw new Error(`${operation} failed (${result.error.code ?? "unknown"})`);
  }
  return result.data;
}

/** Builds an isolated client that persists no session outside this process. */
function client(key) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

/** Creates one confirmed disposable user and captures a real bearer token. */
async function createActor(admin, label) {
  const nonce = randomUUID();
  const email = `biblequest-bearer-${label}-${nonce}@example.invalid`;
  const password = `Bq!${randomBytes(24).toString("base64url")}7z`;
  const created = requireResult(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `Bearer ${label}` },
    }),
    `create actor ${label}`,
  );
  check(created.user?.id, `create actor ${label} returned no user`);

  const actorClient = client(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const signedIn = requireResult(
    await actorClient.auth.signInWithPassword({ email, password }),
    `sign in actor ${label}`,
  );
  check(
    signedIn.user?.id === created.user.id && signedIn.session?.access_token,
    `actor ${label} session identity mismatch`,
  );

  return {
    client: actorClient,
    email,
    id: created.user.id,
    label,
    token: signedIn.session.access_token,
  };
}

/** Sends one request the way the iOS WebView does: cross-origin plus bearer. */
async function nativeFetch(
  targetOrigin,
  pathname,
  { token, method = "GET", headers = {}, body } = {},
) {
  return fetch(new URL(pathname, targetOrigin), {
    method,
    body,
    headers: {
      Origin: NATIVE_ORIGIN,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
}

/** Proves preflights answer for eligible routes and never grant credentials. */
async function verifyCorsLayer(targetOrigin) {
  const preflight = await fetch(
    new URL("/api/billing/status", targetOrigin),
    {
      method: "OPTIONS",
      headers: {
        Origin: NATIVE_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    },
  );
  check(preflight.status === 204, `preflight answered ${preflight.status}`);
  check(
    preflight.headers.get("access-control-allow-origin") === NATIVE_ORIGIN,
    "preflight allow-origin mismatch",
  );
  check(
    !preflight.headers.has("access-control-allow-credentials"),
    "preflight unexpectedly granted credentials",
  );
  check(
    /authorization/i.test(
      preflight.headers.get("access-control-allow-headers") ?? "",
    ),
    "preflight does not allow the Authorization header",
  );

  const excluded = await fetch(new URL("/api/billing/plans", targetOrigin), {
    method: "OPTIONS",
    headers: {
      Origin: NATIVE_ORIGIN,
      "Access-Control-Request-Method": "GET",
    },
  });
  check(
    !excluded.headers.has("access-control-allow-origin"),
    "the shared-cacheable plans route was CORS-decorated",
  );
}

/** Proves each bearer token resolves to exactly its own billing projection. */
async function verifyBillingIsolation(targetOrigin, plusActor, freeActor) {
  const plusStatus = await nativeFetch(targetOrigin, "/api/billing/status", {
    token: plusActor.token,
  });
  check(
    plusStatus.status === 200,
    `entitled billing status answered ${plusStatus.status}`,
  );
  const plusPayload = await plusStatus.json();
  check(
    plusPayload.isPlus === true,
    "the entitled account's token did not resolve its own Plus grant",
  );

  const freeStatus = await nativeFetch(targetOrigin, "/api/billing/status", {
    token: freeActor.token,
  });
  check(
    freeStatus.status === 200,
    `free billing status answered ${freeStatus.status}`,
  );
  const freePayload = await freeStatus.json();
  check(
    freePayload.isPlus === false,
    "a free account's token read another account's entitlement",
  );
}

/** Proves missing, malformed, and forged tokens all fail closed with 401. */
async function verifyFailClosed(targetOrigin, actor) {
  const tampered = `${actor.token.slice(0, -4)}AAAA`;
  const cases = [
    ["missing token", undefined],
    ["malformed token", "not-a-jwt"],
    ["tampered signature", tampered],
  ];
  for (const [name, token] of cases) {
    const response = await nativeFetch(targetOrigin, "/api/billing/status", {
      token,
    });
    check(response.status === 401, `${name} answered ${response.status}`);
    const payload = await response.json();
    check(payload.error === "unauthorized", `${name} body was not sanitized`);
  }
}

/** Builds the multipart body the avatar POST expects. */
function avatarForm() {
  const bytes = Buffer.from(AVATAR_FIXTURE_BASE64, "base64");
  const form = new FormData();
  form.set(
    "avatar",
    new File([bytes], "probe.webp", { type: "image/webp" }),
  );
  return form;
}

/**
 * Exercises all three avatar handlers — the one surface whose RPCs read
 * auth.uid() from the attached JWT, where a verify-only bearer design
 * silently no-ops. Uploads as the owner, proves the other account cannot see
 * it, proves the other account's own delete does not touch it, then deletes.
 */
async function verifyAvatarIsolation(targetOrigin, owner, other) {
  const initial = await nativeFetch(targetOrigin, "/api/profile/avatar", {
    token: owner.token,
  });
  check(
    initial.status !== 503,
    "avatar surface is dormant on the target — enable BIBLEQUEST_AVATAR_SYNC_ENABLED on the Preview; the avatar handlers are a mandatory part of this proof",
  );
  check(initial.status === 404, `pre-upload avatar answered ${initial.status}`);

  const uploaded = await nativeFetch(targetOrigin, "/api/profile/avatar", {
    token: owner.token,
    method: "POST",
    body: avatarForm(),
  });
  check(uploaded.status === 200, `avatar upload answered ${uploaded.status}`);
  check(
    Boolean(uploaded.headers.get("x-biblequest-avatar-version")),
    "avatar upload returned no version marker — auth.uid() did not resolve",
  );

  const ownRead = await nativeFetch(targetOrigin, "/api/profile/avatar", {
    token: owner.token,
  });
  check(ownRead.status === 200, `owner avatar read answered ${ownRead.status}`);

  const crossRead = await nativeFetch(targetOrigin, "/api/profile/avatar", {
    token: other.token,
  });
  check(
    crossRead.status === 404,
    "another account's token could read the owner's avatar",
  );

  const otherDelete = await nativeFetch(targetOrigin, "/api/profile/avatar", {
    token: other.token,
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allOwnedObjects: false }),
  });
  check(
    otherDelete.status === 204,
    `the other account's own delete answered ${otherDelete.status}`,
  );
  const survivingRead = await nativeFetch(targetOrigin, "/api/profile/avatar", {
    token: owner.token,
  });
  check(
    survivingRead.status === 200,
    "another account's delete removed the owner's avatar",
  );

  const ownDelete = await nativeFetch(targetOrigin, "/api/profile/avatar", {
    token: owner.token,
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allOwnedObjects: true }),
  });
  check(ownDelete.status === 204, `owner delete answered ${ownDelete.status}`);
  const afterDelete = await nativeFetch(targetOrigin, "/api/profile/avatar", {
    token: owner.token,
  });
  check(
    afterDelete.status === 404,
    "the owner's avatar survived its own delete",
  );
}

/**
 * Grants one REAL operator Plus entitlement through the sealed RPC.
 *
 * A direct table insert cannot work: migration 0030 revokes writes on
 * operator_plus_grants from service_role (SELECT only) and seals them behind
 * grant_operator_plus, which service_role may execute. The RPC validates the
 * operator against auth.users with a matching lowercase email, so the other
 * disposable actor serves as the granting operator.
 */
async function grantPlus(admin, actor, operator) {
  requireResult(
    await admin.rpc("grant_operator_plus", {
      p_target_user_id: actor.id,
      p_duration_key: "7d",
      p_reason: "native bearer isolation probe",
      p_operator_user_id: operator.id,
      p_operator_email: operator.email,
    }),
    "operator plus grant fixture",
  );
}

/** Removes leftover disposable users from interrupted runs, then this run's. */
async function cleanup(admin, actors) {
  const failures = [];
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const stale = listed.error
    ? []
    : listed.data.users.filter(
        (user) =>
          user.email?.startsWith("biblequest-bearer-") &&
          user.email.endsWith("@example.invalid"),
      );
  const targets = new Map(stale.map((user) => [user.id, user.email]));
  for (const actor of actors) {
    if (actor?.id) targets.set(actor.id, actor.email);
  }
  for (const [id] of targets) {
    // Storage objects do not cascade with the auth user; sweep the folder
    // first so an interrupted run cannot strand private media.
    try {
      const objects = await admin.storage
        .from("profile-avatars")
        .list(id, { limit: 100 });
      const names = (objects.data ?? [])
        .map(({ name }) => name)
        .filter((name) => Boolean(name) && !name.includes("/"))
        .map((name) => `${id}/${name}`);
      if (names.length > 0) {
        await admin.storage.from("profile-avatars").remove(names);
      }
    } catch {
      // Deletion of the user below is the required outcome; a failed sweep
      // surfaces through the readiness checks that watch the bucket.
    }
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) {
      failures.push(`${id.slice(0, 8)}:${removed.error.code ?? "unknown"}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed for user(s): ${failures.join(", ")}`);
  }
}

const targetOrigin = requireEnvironment();
const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY);
const actors = [];
let primaryError = null;
let resultSummary = null;

try {
  const actorA = await createActor(admin, "a");
  actors.push(actorA);
  const actorB = await createActor(admin, "b");
  actors.push(actorB);
  await grantPlus(admin, actorB, actorA);

  await verifyCorsLayer(targetOrigin);
  await verifyBillingIsolation(targetOrigin, actorB, actorA);
  await verifyFailClosed(targetOrigin, actorA);
  await verifyAvatarIsolation(targetOrigin, actorA, actorB);
  await verifyAvatarIsolation(targetOrigin, actorB, actorA);

  resultSummary = {
    authenticatedUsers: 2,
    corsPreflights: 2,
    billingDirections: 2,
    failClosedCases: 3,
    avatarDirections: 2,
    status: "pass",
  };
} catch (error) {
  primaryError = error;
} finally {
  try {
    await cleanup(admin, actors);
  } catch (cleanupError) {
    primaryError ??= cleanupError;
  }
}

if (primaryError) {
  throw primaryError;
}

process.stdout.write(JSON.stringify(resultSummary) + "\n");
