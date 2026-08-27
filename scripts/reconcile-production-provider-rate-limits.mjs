/**
 * Applies only the reviewed 0039 provider-rate retention bound to exact
 * Production after history, checksum, dry-run, and physical-backup checks.
 */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT_REF = "iacnjqnssovaaojswjoh";
const EXPECTED_MANIFEST_SHA256 =
  "fe35b3a284ae4f446586619c24704dc31a99c4a346ab69728c14baa0068d6017";
const PACKET_BEFORE_SHA256 =
  "d16f581dc70be7a46677e6244a9945d6270c29be4f1c7ecf18ca76b4c761c086";
const PACKET_AFTER_SHA256 =
  "7f6607b46581d9298d78bb219c56d8f41b469b9db4c23e4db3ce61379657807d";
const APPLY_CONFIRMATION = `apply 20260826010000 to ${PROJECT_REF}`;
const MAX_BACKUP_AGE_MS = 30 * 60 * 60 * 1000;
const PACKET = {
  version: "20260826010000",
  name: "bound_provider_rate_limit_retention",
  source: "0039_bound_provider_rate_limit_retention.sql",
  sourceSha:
    "ee2b8db0a9f6c5eecce243a9b96358bf66424fb3794c16469d84b29542819581",
};
const PACKET_FILENAME = `${PACKET.version}_${PACKET.name}.sql`;

const REVIEWED_HISTORY = [
  ["20260708040915", "init_questos_v1_schema"],
  ["20260708040947", "rls_policies"],
  ["20260708221421", "add_chapters_read_unique"],
  ["20260709063257", "multi_daily_quests"],
  ["20260709064139", "user_language"],
  ["20260710005147", "purge_user_data"],
  ["20260710005242", "purge_user_data_revoke_anon"],
  ["20260710192143", "user_quests_shelf"],
  ["20260723150000", "reassert_rls_and_purge"],
  ["20260723150100", "analytics_consent_opt_in"],
  ["20260723150200", "rolling_quest_windows_and_recent_verses"],
  ["20260723150300", "bible_translation_preference"],
  ["20260723150400", "kjv_bible_translation_default"],
  ["20260723150500", "journey_event_identity"],
  ["20260723150600", "transactional_daily_quest_sync"],
  ["20260723150700", "launch_content_seed"],
  ["20260723160000", "mutable_account_sync_guards"],
  ["20260723160100", "enforce_mutable_account_sync_boundary"],
  ["20260723160200", "bind_account_sync_identity_and_generation"],
  ["20260723160300", "server_ordered_account_sync_revisions"],
  ["20260723160400", "self_service_account_deletion"],
  ["20260723160500", "generation_bound_account_deletion"],
  ["20260723160600", "resilient_account_deletion"],
  ["20260727193000", "reconcile_launch_contracts_and_lifetime_plus"],
  ["20260728191500", "user_row_size_and_trigger_privileges"],
  ["20260728203000", "operator_plus_grants"],
  ["20260729123000", "stripe_subscription_conflict_key"],
  ["20260729123100", "stripe_dispute_signal_prefix"],
  ["20260731011500", "guided_pilgrimage_progress"],
  ["20260803010000", "distributed_provider_rate_limits"],
  ["20260803170000", "fix_provider_rate_limit_claim_timestamp"],
  ["20260804035000", "arcade_store_purchases"],
  ["20260812005000", "web_account_deletion_hardening"],
  ["20260812010000", "native_account_availability"],
];

// Fails with a bounded message and never reflects credentials or raw SQL.
function fail(message) {
  throw new Error(message);
}

// Hashes one migration or manifest with the pinned release algorithm.
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

// Runs one Supabase command with captured, non-reflected output.
function runSupabase(args, cwd, timeout = 60_000, includeStderr = false) {
  const result = spawnSync("supabase", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_AGENT: "yes" },
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) fail(`Supabase ${args[0]} failed`);
  return includeStderr
    ? `${result.stdout}\n${result.stderr}`
    : result.stdout;
}

// Parses one bounded JSON response from the Supabase CLI.
function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${label} did not return JSON`);
  }
}

// Verifies the complete migration manifest and immutable 0039 source.
async function verifyReleaseInputs() {
  const migrationsDir = join(ROOT, "supabase", "migrations");
  const manifest = await readFile(join(migrationsDir, "manifest.sha256"));
  if (sha256(manifest) !== EXPECTED_MANIFEST_SHA256) {
    fail("Reviewed 38-entry manifest checksum changed");
  }
  const source = await readFile(join(migrationsDir, PACKET.source));
  if (sha256(source) !== PACKET.sourceSha) {
    fail("Reviewed 0039 source checksum changed");
  }
  return source.toString("utf8");
}

// Creates an isolated long-version lane matching production migration history.
async function prepareWorkdir(source) {
  const workdir = await mkdtemp(
    join(tmpdir(), "biblequest-production-provider-rate-"),
  );
  const migrationsDir = join(workdir, "supabase", "migrations");
  await mkdir(migrationsDir, { recursive: true });
  await writeFile(
    join(workdir, "supabase", "config.toml"),
    [
      'project_id = "BibleQuest-production-provider-rate"',
      "",
      "[db]",
      "major_version = 17",
      "",
      "[db.migrations]",
      "enabled = true",
      "schema_paths = []",
      "",
      "[db.seed]",
      "enabled = false",
      "sql_paths = []",
      "",
    ].join("\n"),
  );
  for (const [version, name] of REVIEWED_HISTORY) {
    await writeFile(
      join(migrationsDir, `${version}_${name}.sql`),
      `-- Existing immutable production history marker: ${version} ${name}.\n`,
    );
  }
  const [before, after] = await Promise.all([
    readFile(
      join(
        ROOT,
        "supabase",
        "production-migrations",
        `${PACKET.version}_${PACKET.name}.before.sql`,
      ),
      "utf8",
    ),
    readFile(
      join(
        ROOT,
        "supabase",
        "production-migrations",
        `${PACKET.version}_${PACKET.name}.after.sql`,
      ),
      "utf8",
    ),
  ]);
  if (sha256(before) !== PACKET_BEFORE_SHA256) {
    fail("Reviewed provider-retention before-guard changed");
  }
  if (sha256(after) !== PACKET_AFTER_SHA256) {
    fail("Reviewed provider-retention after-guard changed");
  }
  await writeFile(
    join(migrationsDir, PACKET_FILENAME),
    `${before.trim()}\n\n${source.trim()}\n\n${after.trim()}\n`,
  );
  return workdir;
}

// Links only the disposable migration lane to the pinned production project.
function linkProduction(workdir) {
  runSupabase(
    [
      "link",
      "--project-ref",
      PROJECT_REF,
      "--workdir",
      workdir,
      "--output-format",
      "json",
    ],
    workdir,
  );
}

// Returns the exact ordered remote migration versions.
function remoteHistory(workdir) {
  const result = parseJson(
    runSupabase(
      [
        "migration",
        "list",
        "--linked",
        "--workdir",
        workdir,
        "--output-format",
        "json",
      ],
      workdir,
    ),
    "Migration list",
  );
  if (!Array.isArray(result.migrations)) {
    fail("Migration list is missing migrations");
  }
  return result.migrations
    .filter((migration) => migration.remote)
    .map((migration) => String(migration.remote));
}

// Accepts only the reviewed pre-0039 or completely applied history.
function historyState(actual) {
  const reviewed = REVIEWED_HISTORY.map(([version]) => version);
  const complete = [...reviewed, PACKET.version];
  if (JSON.stringify(actual) === JSON.stringify(reviewed)) return "reviewed";
  if (JSON.stringify(actual) === JSON.stringify(complete)) return "applied";
  fail("Production migration history differs from the reviewed 0039 history");
}

// Requires one recent completed physical backup before any write.
function latestBackup(workdir) {
  const result = parseJson(
    runSupabase(
      [
        "backups",
        "list",
        "--project-ref",
        PROJECT_REF,
        "--output-format",
        "json",
      ],
      workdir,
    ),
    "Backup list",
  );
  const backup = (Array.isArray(result.backups) ? result.backups : [])
    .filter(
      (item) =>
        item?.status === "COMPLETED" &&
        item?.is_physical_backup === true &&
        typeof item?.inserted_at === "string",
    )
    .sort((left, right) => right.inserted_at.localeCompare(left.inserted_at))[0];
  if (!backup) fail("No completed physical production backup exists");
  const age = Date.now() - Date.parse(backup.inserted_at);
  if (!Number.isFinite(age) || age < 0 || age > MAX_BACKUP_AGE_MS) {
    fail("Latest physical production backup is stale");
  }
  return backup.inserted_at;
}

// Requires the dry run to propose exactly the reviewed provider-rate packet.
function dryRun(workdir) {
  const output = runSupabase(
    ["db", "push", "--linked", "--dry-run", "--workdir", workdir],
    workdir,
    60_000,
    true,
  );
  const filenames = [
    ...output.matchAll(/\b(20\d{12})_[a-z0-9_]+\.sql\b/g),
  ].map((match) => match[0]);
  const unique = [...new Set(filenames)];
  if (unique.length !== 1 || unique[0] !== PACKET_FILENAME) {
    fail("Dry run did not propose exactly the reviewed provider-rate packet");
  }
  return unique;
}

// Applies only the packet that passed every read-only gate above.
function applyPacket(workdir) {
  runSupabase(
    ["db", "push", "--linked", "--workdir", workdir, "--yes"],
    workdir,
  );
}

// Accepts one explicit mode and rejects accidental production writes.
function modeFromArguments(argv) {
  if (argv.length !== 1 || !["--dry-run", "--apply"].includes(argv[0])) {
    fail("Use --dry-run or --apply");
  }
  return argv[0] === "--apply" ? "apply" : "dry-run";
}

// Executes the guarded workflow and always removes its isolated lane.
const mode = modeFromArguments(process.argv.slice(2));
if (
  mode === "apply" &&
  process.env.BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
) {
  fail("Production apply confirmation is missing");
}

let workdir;
try {
  const source = await verifyReleaseInputs();
  workdir = await prepareWorkdir(source);
  linkProduction(workdir);
  const initialState = historyState(remoteHistory(workdir));
  const backupAt = latestBackup(workdir);
  const proposed = initialState === "reviewed" ? dryRun(workdir) : [];
  if (mode === "apply" && initialState === "applied") {
    fail("Reviewed production provider-retention migration is already applied");
  }
  if (mode === "apply") {
    applyPacket(workdir);
    if (historyState(remoteHistory(workdir)) !== "applied") {
      fail("Reviewed production provider-retention migration was not recorded");
    }
  }
  console.log(
    JSON.stringify({
      status: "pass",
      mode,
      project_ref: PROJECT_REF,
      manifest_sha256: EXPECTED_MANIFEST_SHA256,
      packet: PACKET_FILENAME,
      source_sha256: PACKET.sourceSha,
      backup_at: backupAt,
      proposed,
      applied: initialState === "applied" || mode === "apply",
    }),
  );
} finally {
  if (workdir) await rm(workdir, { recursive: true, force: true });
}
