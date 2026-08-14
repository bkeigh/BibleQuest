/**
 * Proves the avatar upload and deletion latch serialize across real local
 * PostgreSQL connections. This script never accepts a linked database.
 */
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const USER_ID = "e3000000-0000-4000-8000-000000000003";
const FIRST_OBJECT =
  `${USER_ID}/avatar-e3111111-1111-4111-8111-111111111111.webp`;
const SECOND_OBJECT =
  `${USER_ID}/avatar-e3222222-2222-4222-8222-222222222222.webp`;
const PSQL_ARGS = [
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-X",
  "-q",
  "-v",
  "ON_ERROR_STOP=1",
  "-tA",
];

/** Stops without reflecting database output or synthetic identifiers. */
function fail(message) {
  throw new Error(message);
}

/** Reads the local-only Supabase container name from checked-in config. */
async function localContainer() {
  const config = await readFile(join(ROOT, "supabase", "config.toml"), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1];
  if (!projectId) fail("Local Supabase project_id is unavailable");
  return `supabase_db_${projectId}`;
}

/** Runs one bounded local owner query without returning raw failures. */
function ownerSql(container, sql) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", ...PSQL_ARGS], {
    input: sql,
    encoding: "utf8",
    timeout: 10_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) fail("A local owner assertion failed");
  return result.stdout.trim();
}

/** Confirms one bounded local statement is rejected without reflecting output. */
function ownerSqlDenied(container, sql) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", ...PSQL_ARGS], {
    input: sql,
    encoding: "utf8",
    timeout: 10_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result.status !== 0;
}

/** Starts one local psql transaction and exposes a marker plus final status. */
function startSession(container, sql, marker) {
  const child = spawn("docker", ["exec", "-i", container, "psql", ...PSQL_ARGS], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let markerSettled = false;
  let resolveMarker;
  let rejectMarker;
  const markerReady = new Promise((resolve, reject) => {
    resolveMarker = resolve;
    rejectMarker = reject;
  });
  const markerTimeout = setTimeout(() => {
    if (!markerSettled) {
      markerSettled = true;
      rejectMarker(new Error("Local race marker timed out"));
    }
  }, 8_000);
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
    if (!markerSettled && output.includes(marker)) {
      markerSettled = true;
      clearTimeout(markerTimeout);
      resolveMarker();
    }
  });
  const done = new Promise((resolve) => {
    child.on("close", (code) => {
      clearTimeout(markerTimeout);
      if (!markerSettled) {
        markerSettled = true;
        rejectMarker(new Error("Local race session ended before its marker"));
      }
      resolve({ ok: code === 0 });
    });
    child.on("error", () => resolve({ ok: false }));
  });
  child.stdin.end(sql);
  return { done, markerReady };
}

/** Waits until the named local session is blocked on a PostgreSQL lock. */
async function requireLockWait(container, applicationName) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const waiting = ownerSql(
      container,
      `select exists (
         select 1 from pg_catalog.pg_stat_activity
         where application_name = '${applicationName}'
           and wait_event_type = 'Lock'
       )::int;`,
    );
    if (waiting === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  fail("The competing local transaction never waited on the owner lock");
}

/** Removes only this script's synthetic local fixture. */
function cleanup(container) {
  ownerSql(
    container,
    `begin;
     select pg_catalog.set_config('storage.allow_delete_query', 'true', true);
     select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
     delete from storage.objects
     where bucket_id = 'profile-avatars'
       and name like '${USER_ID}/%';
     delete from auth.users where id = '${USER_ID}';
     commit;`,
  );
}

const container = await localContainer();
try {
  cleanup(container);
  if (
    ownerSql(
      container,
      `select (
         public.account_deletion_storage_contract() =
         '{"contract":"biblequest_account_deletion_storage_v1","ok":true}'::jsonb
       )::int;`,
    ) !== "1"
  ) {
    fail("The local Storage deletion contract is unavailable");
  }
  ownerSql(
    container,
    `insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
     values ('${USER_ID}', '{}'::jsonb, now(), now());`,
  );

  // An upload that already holds FOR SHARE must finish before begin can latch.
  const uploadFirst = startSession(
    container,
    `begin;
     set application_name = 'biblequest_upload_first';
     set local role authenticated;
     select pg_catalog.set_config('request.jwt.claim.sub', '${USER_ID}', true);
     insert into storage.objects (bucket_id, name, owner_id, metadata)
     values ('profile-avatars', '${FIRST_OBJECT}', '${USER_ID}', '{}'::jsonb);
     \\echo UPLOAD_LOCKED
     select pg_catalog.pg_sleep(2);
     commit;`,
    "UPLOAD_LOCKED",
  );
  await uploadFirst.markerReady;
  const waitingBegin = startSession(
    container,
    `begin;
     set application_name = 'biblequest_begin_waiting';
     set local role authenticated;
     select pg_catalog.set_config('request.jwt.claim.sub', '${USER_ID}', true);
     select pg_catalog.set_config(
       'request.headers',
       '{"x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"${USER_ID}"}',
       true
     );
     select public.begin_own_account_deletion();
     \\echo BEGIN_LATCHED
     commit;`,
    "BEGIN_LATCHED",
  );
  await requireLockWait(container, "biblequest_begin_waiting");
  const [uploadFirstResult, waitingBeginResult] = await Promise.all([
    uploadFirst.done,
    waitingBegin.done,
  ]);
  if (!uploadFirstResult.ok || !waitingBeginResult.ok) {
    fail("The upload-first serialization transaction failed");
  }
  if (
    ownerSql(
      container,
      `select (
         (select count(*) from storage.objects
          where bucket_id = 'profile-avatars' and name = '${FIRST_OBJECT}') = 1
         and
         (select count(*) from public.account_deletion_latches
          where user_id = '${USER_ID}') = 1
       )::int;`,
    ) !== "1"
  ) {
    fail("The upload-first serialization result was invalid");
  }

  ownerSql(
    container,
    `begin;
     select pg_catalog.set_config('storage.allow_delete_query', 'true', true);
     delete from storage.objects
     where bucket_id = 'profile-avatars' and name = '${FIRST_OBJECT}';
     delete from public.account_deletion_latches where user_id = '${USER_ID}';
     commit;`,
  );

  // A post-latch upload must wait for begin and then fail its policy check.
  const latchFirst = startSession(
    container,
    `begin;
     set application_name = 'biblequest_latch_first';
     set local role authenticated;
     select pg_catalog.set_config('request.jwt.claim.sub', '${USER_ID}', true);
     select pg_catalog.set_config(
       'request.headers',
       '{"x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"${USER_ID}"}',
       true
     );
     select public.begin_own_account_deletion();
     \\echo LATCH_LOCKED
     select pg_catalog.pg_sleep(2);
     commit;`,
    "LATCH_LOCKED",
  );
  await latchFirst.markerReady;
  const waitingUpload = startSession(
    container,
    `begin;
     set application_name = 'biblequest_upload_waiting';
     set local role authenticated;
     select pg_catalog.set_config('request.jwt.claim.sub', '${USER_ID}', true);
     insert into storage.objects (bucket_id, name, owner_id, metadata)
     values ('profile-avatars', '${SECOND_OBJECT}', '${USER_ID}', '{}'::jsonb);
     \\echo UPLOAD_UNEXPECTEDLY_SUCCEEDED
     commit;`,
    "UPLOAD_UNEXPECTEDLY_SUCCEEDED",
  );
  void waitingUpload.markerReady.catch(() => {});
  await requireLockWait(container, "biblequest_upload_waiting");
  const [latchFirstResult, waitingUploadResult] = await Promise.all([
    latchFirst.done,
    waitingUpload.done,
  ]);
  if (!latchFirstResult.ok || waitingUploadResult.ok) {
    fail("The latch-first serialization result was invalid");
  }
  if (
    ownerSql(
      container,
      `select (
         (select count(*) from storage.objects
          where bucket_id = 'profile-avatars' and name = '${SECOND_OBJECT}') = 0
         and
         (select count(*) from public.account_deletion_latches
          where user_id = '${USER_ID}') = 1
       )::int;`,
    ) !== "1"
  ) {
    fail("The post-latch upload left local residue");
  }

  ownerSql(
    container,
    `delete from public.account_deletion_latches where user_id = '${USER_ID}';`,
  );

  // Final deletion must wait for an accepted private write, then cascade it.
  const privateWriteFirst = startSession(
    container,
    `begin;
     set application_name = 'biblequest_private_write_first';
     set local role authenticated;
     select pg_catalog.set_config('request.jwt.claim.sub', '${USER_ID}', true);
     select pg_catalog.set_config(
       'request.headers',
       '{"x-biblequest-web-auth":"v2"}',
       true
     );
     insert into public.user_guided_movements (
       user_id, session_key, content_id, movement_key, occurred_at
     ) values (
       '${USER_ID}',
       'pilgrimage|pilgrimage.deletion.v1',
       'pilgrimage.deletion.v1',
       'started',
       now()
     );
     \\echo PRIVATE_WRITE_LOCKED
     select pg_catalog.pg_sleep(2);
     commit;`,
    "PRIVATE_WRITE_LOCKED",
  );
  await privateWriteFirst.markerReady;
  const finalDeletion = startSession(
    container,
    `begin;
     set application_name = 'biblequest_final_deletion_waiting';
     set local role authenticated;
     select pg_catalog.set_config('request.jwt.claim.sub', '${USER_ID}', true);
     select pg_catalog.set_config(
       'request.headers',
       '{"x-biblequest-web-auth":"v2","x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"${USER_ID}"}',
       true
     );
     select public.delete_own_account();
     \\echo IDENTITY_DELETED
     commit;`,
    "IDENTITY_DELETED",
  );
  await requireLockWait(container, "biblequest_final_deletion_waiting");
  const [privateWriteResult, finalDeletionResult] = await Promise.all([
    privateWriteFirst.done,
    finalDeletion.done,
  ]);
  if (!privateWriteResult.ok || !finalDeletionResult.ok) {
    fail("The private-write deletion serialization transaction failed");
  }
  if (
    ownerSql(
      container,
      `select (
         (select count(*) from auth.users where id = '${USER_ID}') = 0
         and
         (select count(*) from public.profiles where id = '${USER_ID}') = 0
         and
         (select count(*) from public.user_sync_state
          where user_id = '${USER_ID}') = 0
         and
         (select count(*) from public.user_guided_movements
          where user_id = '${USER_ID}') = 0
         and
         (select count(*) from public.account_deletion_latches
          where user_id = '${USER_ID}') = 0
       )::int;`,
    ) !== "1"
  ) {
    fail("Final deletion left private database residue");
  }
  if (
    !ownerSqlDenied(
      container,
      `begin;
       set local role authenticated;
       select pg_catalog.set_config('request.jwt.claim.sub', '${USER_ID}', true);
       select pg_catalog.set_config(
         'request.headers',
         '{"x-biblequest-web-auth":"v2"}',
         true
       );
       insert into public.user_guided_movements (
         user_id, session_key, content_id, movement_key, occurred_at
       ) values (
         '${USER_ID}',
         'pilgrimage|pilgrimage.deletion.v1',
         'pilgrimage.deletion.v1',
         'arrive',
         now()
       );
       rollback;`,
    )
  ) {
    fail("A captured token recreated private rows after Auth deletion");
  }
  if (
    !ownerSqlDenied(
      container,
      `begin;
       set local role authenticated;
       select pg_catalog.set_config('request.jwt.claim.sub', '${USER_ID}', true);
       insert into storage.objects (bucket_id, name, owner_id, metadata)
       values ('profile-avatars', '${SECOND_OBJECT}', '${USER_ID}', '{}'::jsonb);
       rollback;`,
    )
  ) {
    fail("A captured token recreated Storage after Auth deletion");
  }

  console.log(
    JSON.stringify({
      status: "pass",
      connections: 2,
      upload_first_waited: true,
      latch_first_upload_denied: true,
      deletion_waited_for_private_write: true,
      post_delete_private_write_denied: true,
      post_delete_upload_denied: true,
    }),
  );
} finally {
  cleanup(container);
}
