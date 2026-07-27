#!/usr/bin/env node

/**
 * Exercises staging RLS with two temporary users and normal authenticated
 * sessions, then deletes both users and their cascaded fixtures.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const CONFIRMATION = "staging-only-two-user-isolation";
const REQUIRED_ENV = [
  "BIBLEQUEST_STAGING_PROJECT_REF",
  "BIBLEQUEST_CONFIRM_STAGING_TWO_USER_TEST",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

/** Stops before any mutation when the staging-only safety contract is absent. */
function requireEnvironment() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment: ${missing.join(", ")}`);
  }
  if (
    process.env.BIBLEQUEST_CONFIRM_STAGING_TWO_USER_TEST !== CONFIRMATION
  ) {
    throw new Error(
      `Set BIBLEQUEST_CONFIRM_STAGING_TWO_USER_TEST=${CONFIRMATION}`,
    );
  }

  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const expectedHost = `${process.env.BIBLEQUEST_STAGING_PROJECT_REF}.supabase.co`;
  if (url.protocol !== "https:" || url.hostname !== expectedHost) {
    throw new Error(
      `Refusing non-staging target; expected https://${expectedHost}`,
    );
  }
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

/** Creates one confirmed disposable user and signs in through the anon client. */
async function createActor(admin, label) {
  const nonce = randomUUID();
  const email = `biblequest-rls-${label}-${nonce}@example.invalid`;
  const password = `Bq!${randomBytes(24).toString("base64url")}7z`;
  const created = requireResult(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `RLS ${label}` },
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
    id: created.user.id,
    label,
    marker: `synthetic-${label}-${nonce}`,
  };
}

/**
 * Seeds bounded fixtures through the staging admin so normal user sessions can
 * exercise the deployed read and mutation boundary without bypassing it.
 */
async function createOwnerFixtures(admin, actor) {
  const tomorrow = actor.label === "a" ? "2099-01-01" : "2099-01-02";
  const questSlug = `rls-probe-${actor.label}`;
  const writes = [
    ["user_settings", { user_id: actor.id }],
    ["notification_preferences", { user_id: actor.id }],
    [
      "user_daily_quests",
      {
        user_id: actor.id,
        quest_slug: questSlug,
        assigned_date: tomorrow,
      },
    ],
    ["user_quests", { user_id: actor.id, quest_slug: questSlug }],
    ["quest_completions", { user_id: actor.id, quest_slug: questSlug }],
    [
      "prayers",
      {
        user_id: actor.id,
        title: "Synthetic isolation probe",
        body: actor.marker,
      },
    ],
    [
      "reflections",
      {
        user_id: actor.id,
        prompt: "Synthetic isolation probe",
        body: actor.marker,
      },
    ],
    [
      "verse_bookmarks",
      {
        user_id: actor.id,
        book_slug: "genesis",
        book_name: "Genesis",
        chapter: 1,
        verse: actor.label === "a" ? 1 : 2,
        text: actor.marker,
      },
    ],
    [
      "user_recent_verses",
      {
        user_id: actor.id,
        book_slug: "genesis",
        book_name: "Genesis",
        chapter: 1,
        verse_start: actor.label === "a" ? 1 : 2,
        verse_end: actor.label === "a" ? 1 : 2,
        reference: actor.label === "a" ? "Genesis 1:1" : "Genesis 1:2",
        text: actor.marker,
      },
    ],
    [
      "reading_progress",
      {
        user_id: actor.id,
        book_slug: "genesis",
        book_name: "Genesis",
        chapter: actor.label === "a" ? 1 : 2,
      },
    ],
    [
      "chapters_read",
      {
        user_id: actor.id,
        book_slug: "genesis",
        chapter: actor.label === "a" ? 1 : 2,
        read_on: tomorrow,
      },
    ],
    [
      "journey_events",
      {
        user_id: actor.id,
        event_type: "isolation_probe",
        title: actor.marker,
      },
    ],
    [
      "growth_events",
      {
        user_id: actor.id,
        growth_type: "isolation_probe",
        source_type: "staging_check",
      },
    ],
    [
      "user_milestones",
      {
        user_id: actor.id,
        milestone_key: `isolation-probe-${actor.label}`,
      },
    ],
  ];

  const identifiers = new Map();
  for (const [table, row] of writes) {
    const inserted = requireResult(
      await admin.from(table).insert(row).select("*").single(),
      `fixture insert ${table}`,
    );
    identifiers.set(table, inserted);
  }
  requireResult(
    await admin.from("user_daily_quest_days").upsert({
      user_id: actor.id,
      assigned_date: tomorrow,
      revision: 1,
    }),
    "fixture insert user_daily_quest_days",
  );
  return { assignedDate: tomorrow, identifiers };
}

/** Creates server-managed rows only so normal-user read isolation can be tested. */
async function createServerFixtures(admin, actor) {
  const fingerprint = createHash("sha256")
    .update(actor.marker)
    .digest("hex");
  requireResult(
    await admin.from("subscriptions").insert({ user_id: actor.id }),
    "admin subscription fixture",
  );
  requireResult(
    await admin
      .from("push_reminder_preferences")
      .insert({ user_id: actor.id }),
    "admin push preferences fixture",
  );
  const subscription = requireResult(
    await admin
      .from("push_subscriptions")
      .insert({
        user_id: actor.id,
        endpoint_fingerprint: fingerprint,
        encrypted_subscription: actor.marker.padEnd(96, "x"),
        encryption_key_version: 1,
      })
      .select("id")
      .single(),
    "admin push subscription fixture",
  );
  requireResult(
    await admin.from("push_deliveries").insert({
      subscription_id: subscription.id,
      user_id: actor.id,
      reminder_kind: "test",
      reminder_date: actor.label === "a" ? "2099-01-01" : "2099-01-02",
      scheduled_for: "2099-01-01T12:00:00Z",
      claim_token: randomUUID(),
    }),
    "admin push delivery fixture",
  );
}

const OWNER_TABLES = [
  ["profiles", "id"],
  ["user_settings", "user_id"],
  ["user_daily_quests", "user_id"],
  ["user_quests", "user_id"],
  ["quest_completions", "user_id"],
  ["prayers", "user_id"],
  ["reflections", "user_id"],
  ["verse_bookmarks", "user_id"],
  ["user_recent_verses", "user_id"],
  ["reading_progress", "user_id"],
  ["chapters_read", "user_id"],
  ["journey_events", "user_id"],
  ["growth_events", "user_id"],
  ["user_milestones", "user_id"],
  ["notification_preferences", "user_id"],
  ["subscriptions", "user_id"],
  ["push_reminder_preferences", "user_id"],
  ["push_subscriptions", "user_id"],
  ["push_deliveries", "user_id"],
];

/** Proves every fixture is visible to its owner and hidden from the other user. */
async function verifyCatalogIsolation(actor, other) {
  for (const [table, ownerColumn] of OWNER_TABLES) {
    const own = requireResult(
      await actor.client
        .from(table)
        .select(ownerColumn)
        .eq(ownerColumn, actor.id),
      `owner select ${table}`,
    );
    check(own.length > 0, `${table} hid owner fixture`);

    const cross = requireResult(
      await actor.client
        .from(table)
        .select(ownerColumn)
        .eq(ownerColumn, other.id),
      `cross select ${table}`,
    );
    check(cross.length === 0, `${table} exposed another owner`);
  }
}

/** Proves retained state and daily revisions expose only the signed-in owner. */
async function verifyRestrictedColumnIsolation(actor, ownFixtures, otherFixtures) {
  const syncState = requireResult(
    await actor.client.from("user_sync_state").select("generation,updated_at"),
    "select sync state",
  );
  check(syncState.length === 1, "sync state row count was not owner-bounded");

  const dailyDays = requireResult(
    await actor.client
      .from("user_daily_quest_days")
      .select("assigned_date,revision"),
    "select daily quest revisions",
  );
  check(
    dailyDays.some((row) => row.assigned_date === ownFixtures.assignedDate),
    "daily quest revision hid owner day",
  );
  check(
    dailyDays.every((row) => row.assigned_date !== otherFixtures.assignedDate),
    "daily quest revision exposed another owner",
  );
}

/** Proves spoofed ownership, cross-owner delete, and cross-owner update fail. */
async function verifyMutationIsolation(actor, other, otherFixtures) {
  const spoofPrayer = await actor.client.from("prayers").insert({
    user_id: other.id,
    body: "synthetic-spoof-probe",
  });
  check(Boolean(spoofPrayer.error), "spoofed prayer insert unexpectedly passed");

  const spoofReflection = await actor.client.from("reflections").insert({
    user_id: other.id,
    body: "synthetic-spoof-probe",
  });
  check(
    Boolean(spoofReflection.error),
    "spoofed reflection insert unexpectedly passed",
  );

  const otherPrayer = otherFixtures.identifiers.get("prayers");
  const crossDelete = await actor.client
    .from("prayers")
    .delete()
    .eq("id", otherPrayer.id)
    .select("id");
  check(
    Boolean(crossDelete.error) || crossDelete.data?.length === 0,
    "cross-owner prayer delete unexpectedly returned data",
  );
  const prayerStillThere = requireResult(
    await other.client.from("prayers").select("id").eq("id", otherPrayer.id),
    "verify prayer survived",
  );
  check(prayerStillThere.length === 1, "cross-owner prayer delete changed data");

  const otherReflection = otherFixtures.identifiers.get("reflections");
  const crossUpdate = await actor.client
    .from("reflections")
    .update({ body: "synthetic-spoof-probe" })
    .eq("id", otherReflection.id)
    .select("id");
  check(
    Boolean(crossUpdate.error) || crossUpdate.data?.length === 0,
    "cross-owner reflection update changed data",
  );
  const reflectionStillThere = requireResult(
    await other.client
      .from("reflections")
      .select("id")
      .eq("id", otherReflection.id),
    "verify reflection survived",
  );
  check(
    reflectionStillThere.length === 1,
    "cross-owner reflection update removed data",
  );
}

/** Proves server-only financial and operator tables cannot be read by users. */
async function verifyServerOnlyTables(actor) {
  const tables = [
    "stripe_customers",
    "stripe_webhook_events",
    "stripe_action_claims",
    "stripe_billing_signals",
    "stripe_support_payments",
    "console_audit_logs",
    "push_test_claims",
  ];
  for (const table of tables) {
    const result = await actor.client.from(table).select("*").limit(1);
    check(Boolean(result.error), `${table} unexpectedly allowed client read`);
  }
}

/** Proves guessed private Storage folders reveal no object names. */
async function verifyStorageIsolation(actor, other) {
  const result = requireResult(
    await actor.client.storage.from("profile-avatars").list(other.id, {
      limit: 10,
    }),
    "cross-owner avatar list",
  );
  check(result.length === 0, "avatar Storage exposed another owner");
}

/** Deletes one fixture subscription before its nullable account FK is cleared. */
async function deleteFixtureSubscription(admin, actor) {
  const result = await admin
    .from("subscriptions")
    .delete()
    .eq("user_id", actor.id);
  if (result.error) {
    throw new Error(
      `Subscription cleanup failed (${result.error.code ?? "unknown"})`,
    );
  }
}

/** Uses the reviewed self-service path, with admin deletion as a fallback. */
async function deleteActor(admin, actor) {
  await deleteFixtureSubscription(admin, actor);

  let actorClient = actor.client;
  if (!actorClient) {
    const password = `Bq!${randomBytes(24).toString("base64url")}7z`;
    const updated = await admin.auth.admin.updateUserById(actor.id, {
      password,
    });
    if (!updated.error && actor.email) {
      actorClient = client(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      const signedIn = await actorClient.auth.signInWithPassword({
        email: actor.email,
        password,
      });
      if (signedIn.error) actorClient = null;
    }
  }

  if (actorClient) {
    const selfDelete = await actorClient.rpc("delete_own_account");
    if (!selfDelete.error) return;
  }

  const adminDelete = await admin.auth.admin.deleteUser(actor.id);
  if (adminDelete.error) {
    throw new Error(
      `Actor cleanup failed (${adminDelete.error.code ?? adminDelete.error.status ?? "unknown"})`,
    );
  }
}

/** Removes stale disposable users from interrupted staging-only runs. */
async function cleanupStaleActors(admin) {
  const listed = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listed.error) {
    throw new Error(
      `Stale actor lookup failed (${listed.error.code ?? "unknown"})`,
    );
  }
  const stale = listed.data.users.filter(
    (user) =>
      user.email?.startsWith("biblequest-rls-") &&
      user.email.endsWith("@example.invalid"),
  );
  for (const user of stale) {
    await deleteActor(admin, {
      client: null,
      email: user.email,
      id: user.id,
      label: "stale",
    });
  }
}

/** Deletes temporary auth users and their cascaded fixture rows. */
async function cleanup(admin, actors) {
  const failures = [];
  for (const actor of actors) {
    if (!actor?.id) continue;
    try {
      await deleteActor(admin, actor);
    } catch (error) {
      failures.push(
        `${actor.label}:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed for actor(s): ${failures.join(", ")}`);
  }
}

requireEnvironment();
const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY);
const actors = [];
let primaryError = null;
let resultSummary = null;

try {
  await cleanupStaleActors(admin);
  const actorA = await createActor(admin, "a");
  actors.push(actorA);
  const actorB = await createActor(admin, "b");
  actors.push(actorB);

  const fixturesA = await createOwnerFixtures(admin, actorA);
  const fixturesB = await createOwnerFixtures(admin, actorB);
  await createServerFixtures(admin, actorA);
  await createServerFixtures(admin, actorB);

  await verifyCatalogIsolation(actorA, actorB);
  await verifyCatalogIsolation(actorB, actorA);
  await verifyRestrictedColumnIsolation(
    actorA,
    fixturesA,
    fixturesB,
  );
  await verifyRestrictedColumnIsolation(
    actorB,
    fixturesB,
    fixturesA,
  );
  await verifyMutationIsolation(actorA, actorB, fixturesB);
  await verifyMutationIsolation(actorB, actorA, fixturesA);
  await verifyServerOnlyTables(actorA);
  await verifyServerOnlyTables(actorB);
  await verifyStorageIsolation(actorA, actorB);
  await verifyStorageIsolation(actorB, actorA);

  resultSummary = {
    authenticatedUsers: 2,
    catalogRelations: OWNER_TABLES.length + 2,
    crossOwnerDirections: 2,
    serverOnlyRelations: 7,
    storageDirections: 2,
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
