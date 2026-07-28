/**
 * Builds an isolated, forward-only Supabase migration lane for the frozen
 * production history and either proves or applies the reviewed 0029 packet.
 */

import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT_REF = "iacnjqnssovaaojswjoh";
const PACKET_VERSION = "20260728191500";
const PACKET_NAME = "user_row_size_and_trigger_privileges";
const PACKET_FILENAME = `${PACKET_VERSION}_${PACKET_NAME}.sql`;
const EXPECTED_SOURCE_SHA256 =
  "65f9c340e7733696f220f2fc92b0cdc486098f7e4bcde1a03ec6b999784fc4be";
const APPLY_CONFIRMATION = `apply ${PACKET_VERSION} to ${PROJECT_REF}`;
const MAX_BACKUP_AGE_MS = 30 * 60 * 60 * 1000;

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
];

/** Fails with a bounded message and never reflects credentials or raw SQL. */
function fail(message) {
  throw new Error(message);
}

/** Runs one Supabase CLI command with captured output. */
function runSupabase(args, cwd = ROOT, includeStderr = false) {
  const result = spawnSync("supabase", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_AGENT: "yes" },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`Supabase ${args[0]} failed`);
  }
  return includeStderr
    ? `${result.stdout}\n${result.stderr}`
    : result.stdout;
}

/** Parses the single JSON object returned by current Supabase CLI commands. */
function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${label} did not return JSON`);
  }
}

/** Returns the exact applied remote migration versions. */
function remoteHistory(workdir) {
  const result = parseJson(
    runSupabase([
      "migration",
      "list",
      "--linked",
      "--workdir",
      workdir,
      "--output-format",
      "json",
    ]),
    "Migration list",
  );
  if (!Array.isArray(result.migrations)) {
    fail("Migration list is missing migrations");
  }
  return result.migrations
    .filter((migration) => migration.remote)
    .map((migration) => String(migration.remote));
}

/** Classifies only the reviewed pre-apply or exact post-apply history. */
function historyState(actual) {
  const reviewed = REVIEWED_HISTORY.map(([version]) => version);
  if (JSON.stringify(actual) === JSON.stringify(reviewed)) return "reviewed";
  if (
    JSON.stringify(actual) ===
    JSON.stringify([...reviewed, PACKET_VERSION])
  ) {
    return "applied";
  }
  fail("Production migration history differs from the reviewed history");
}

/** Requires one recent, completed physical backup before any real push. */
function latestBackup() {
  const result = parseJson(
    runSupabase([
      "backups",
      "list",
      "--project-ref",
      PROJECT_REF,
      "--output-format",
      "json",
    ]),
    "Backup list",
  );
  const backups = Array.isArray(result.backups) ? result.backups : [];
  const backup = backups
    .filter(
      (item) =>
        item?.status === "COMPLETED" &&
        item?.is_physical_backup === true &&
        typeof item?.inserted_at === "string",
    )
    .sort((left, right) =>
      right.inserted_at.localeCompare(left.inserted_at),
    )[0];
  if (!backup) fail("No completed physical production backup exists");
  const age = Date.now() - Date.parse(backup.inserted_at);
  if (!Number.isFinite(age) || age < 0 || age > MAX_BACKUP_AGE_MS) {
    fail("Latest physical production backup is stale");
  }
  return backup.inserted_at;
}

/** Creates the temporary migration workdir without changing repository state. */
async function prepareWorkdir() {
  const workdir = await mkdtemp(
    join(tmpdir(), "biblequest-production-user-row-hardening-"),
  );
  const supabaseDir = join(workdir, "supabase");
  const migrationsDir = join(supabaseDir, "migrations");
  await mkdir(migrationsDir, { recursive: true });
  await writeFile(
    join(supabaseDir, "config.toml"),
    [
      'project_id = "BibleQuest-production-user-row-hardening"',
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

  const sourcePath = join(
    ROOT,
    "supabase",
    "migrations",
    "0029_user_row_size_and_trigger_privileges.sql",
  );
  const beforePath = join(
    ROOT,
    "supabase",
    "production-migrations",
    `${PACKET_VERSION}_${PACKET_NAME}.before.sql`,
  );
  const afterPath = join(
    ROOT,
    "supabase",
    "production-migrations",
    `${PACKET_VERSION}_${PACKET_NAME}.after.sql`,
  );
  const [source, before, after] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(beforePath, "utf8"),
    readFile(afterPath, "utf8"),
  ]);
  const sourceSha = createHash("sha256").update(source).digest("hex");
  if (sourceSha !== EXPECTED_SOURCE_SHA256) {
    fail("Reviewed 0029 source checksum changed");
  }
  await writeFile(
    join(migrationsDir, PACKET_FILENAME),
    `${before.trim()}\n\n${source.trim()}\n\n${after.trim()}\n`,
  );
  return { workdir, sourceSha };
}

/** Links only the isolated temporary workdir to the frozen production ref. */
function linkProduction(workdir) {
  runSupabase([
    "link",
    "--project-ref",
    PROJECT_REF,
    "--workdir",
    workdir,
    "--output-format",
    "json",
  ]);
}

/** Requires the dry run to propose exactly the one reviewed packet. */
function dryRun(workdir) {
  const output = runSupabase(
    [
      "db",
      "push",
      "--linked",
      "--dry-run",
      "--workdir",
      workdir,
    ],
    ROOT,
    true,
  );
  const versions = [
    ...output.matchAll(/\b(20\d{12})_[a-z0-9_]+\.sql\b/g),
  ].map((match) => match[0]);
  const unique = [...new Set(versions)];
  if (unique.length !== 1 || unique[0] !== PACKET_FILENAME) {
    fail(
      `Dry run proposed ${unique.length === 0 ? "no packet" : unique.join(",")}`,
    );
  }
  return unique;
}

/** Applies the already-dry-run packet through Supabase migration bookkeeping. */
function applyPacket(workdir) {
  runSupabase([
    "db",
    "push",
    "--linked",
    "--workdir",
    workdir,
    "--yes",
  ]);
}

/** Accepts one explicit mode and rejects accidental production writes. */
function modeFromArguments(argv) {
  if (argv.length !== 1 || !["--dry-run", "--apply"].includes(argv[0])) {
    fail("Use --dry-run or --apply");
  }
  return argv[0] === "--apply" ? "apply" : "dry-run";
}

// Executes the guarded workflow and always removes its disposable workdir.
const mode = modeFromArguments(process.argv.slice(2));
if (
  mode === "apply" &&
  process.env.BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
) {
  fail("Production apply confirmation is missing");
}

let prepared;
try {
  prepared = await prepareWorkdir();
  linkProduction(prepared.workdir);
  const initialHistoryState = historyState(remoteHistory(prepared.workdir));
  const backupAt = latestBackup();
  let proposed = [];

  if (initialHistoryState === "reviewed") {
    proposed = dryRun(prepared.workdir);
  } else if (mode === "apply") {
    fail("Reviewed production packet is already applied");
  }

  if (mode === "apply" && initialHistoryState === "reviewed") {
    applyPacket(prepared.workdir);
    if (historyState(remoteHistory(prepared.workdir)) !== "applied") {
      fail("Reviewed production packet was not recorded");
    }
  }

  console.log(
    JSON.stringify({
      status: "pass",
      mode,
      project_ref: PROJECT_REF,
      packet: PACKET_FILENAME,
      source_sha256: prepared.sourceSha,
      backup_at: backupAt,
      proposed,
      applied: initialHistoryState === "applied" || mode === "apply",
    }),
  );
} finally {
  if (prepared?.workdir) {
    await rm(prepared.workdir, { recursive: true, force: true });
  }
}
