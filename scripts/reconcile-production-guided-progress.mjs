/**
 * Builds an isolated, forward-only production lane for guided pilgrimage
 * progress with exact history, backup, checksum, and schema-diff guards.
 */

import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT_REF = "iacnjqnssovaaojswjoh";
const EXPECTED_MANIFEST_SHA256 =
  "36f15c8c64b4e39c81f6f21ebc0e160bce9217aaba301dd9d7f5bfd5db462f43";
const APPLY_CONFIRMATION =
  `apply 20260731011500 to ${PROJECT_REF}`;
const MAX_BACKUP_AGE_MS = 30 * 60 * 60 * 1000;
const PACKET = {
  version: "20260731011500",
  name: "guided_pilgrimage_progress",
  source: "0033_guided_pilgrimage_progress.sql",
  sourceSha:
    "8198b519fc25fe62cc85c16acb526fcc37d0a8692e31d0e05b4aef8ea804ed3b",
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
];

/** Fails with a bounded message and never reflects credentials or raw SQL. */
function fail(message) {
  throw new Error(message);
}

/** Hashes one migration or manifest with the pinned SHA-256 algorithm. */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Runs one Supabase CLI command with captured, non-reflected output. */
function runSupabase(args, cwd = ROOT, timeout = 60_000, includeStderr = false) {
  const result = spawnSync("supabase", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_AGENT: "yes" },
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`Supabase ${args[0]} failed`);
  }
  return includeStderr
    ? `${result.stdout}\n${result.stderr}`
    : result.stdout;
}

/** Parses the single JSON value returned by current Supabase CLI commands. */
function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${label} did not return JSON`);
  }
}

/** Verifies the frozen 32-file manifest, file set, and every source checksum. */
async function verifyManifest() {
  const migrationsDir = join(ROOT, "supabase", "migrations");
  const manifest = await readFile(join(migrationsDir, "manifest.sha256"));
  const frozenManifest = `${manifest
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .slice(0, 32)
    .join("\n")}\n`;
  if (sha256(frozenManifest) !== EXPECTED_MANIFEST_SHA256) {
    fail("Frozen 32-file manifest checksum changed");
  }

  const entries = frozenManifest
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^([a-f0-9]{64})  ((\d{4})_[a-z0-9_]+\.sql)$/,
      );
      if (!match) fail("Frozen manifest contains an invalid entry");
      return { checksum: match[1], filename: match[2], version: match[3] };
    });
  if (
    entries.length !== 32 ||
    entries[0]?.version !== "0001" ||
    entries.at(-1)?.version !== "0033" ||
    entries.some((entry) => entry.version === "0013")
  ) {
    fail("Frozen manifest version sequence changed");
  }

  const actualFiles = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
    .slice(0, 32);
  if (
    JSON.stringify(actualFiles) !==
    JSON.stringify(entries.map((entry) => entry.filename))
  ) {
    fail("Migration file set differs from the frozen manifest");
  }

  for (const entry of entries) {
    const source = await readFile(join(migrationsDir, entry.filename));
    if (sha256(source) !== entry.checksum) {
      fail(`Migration ${entry.version} checksum changed`);
    }
  }
  if (
    entries.at(-1)?.filename !== PACKET.source ||
    entries.at(-1)?.checksum !== PACKET.sourceSha
  ) {
    fail("Reviewed 0033 source checksum changed");
  }
  return entries;
}

/** Writes one minimal Supabase config inside a disposable work directory. */
async function writeConfig(workdir, suffix) {
  const supabaseDir = join(workdir, "supabase");
  await mkdir(join(supabaseDir, "migrations"), { recursive: true });
  await writeFile(
    join(supabaseDir, "config.toml"),
    [
      `project_id = "BibleQuest-production-guided-${suffix}"`,
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
}

/** Creates the exact production history lane and one reviewed 0033 packet. */
async function prepareHistoryWorkdir() {
  const workdir = await mkdtemp(
    join(tmpdir(), "biblequest-production-guided-history-"),
  );
  await writeConfig(workdir, "history");
  const migrationsDir = join(workdir, "supabase", "migrations");

  for (const [version, name] of REVIEWED_HISTORY) {
    await writeFile(
      join(migrationsDir, `${version}_${name}.sql`),
      `-- Existing immutable production history marker: ${version} ${name}.\n`,
    );
  }

  const sourcePath = join(ROOT, "supabase", "migrations", PACKET.source);
  const beforePath = join(
    ROOT,
    "supabase",
    "production-migrations",
    `${PACKET.version}_${PACKET.name}.before.sql`,
  );
  const afterPath = join(
    ROOT,
    "supabase",
    "production-migrations",
    `${PACKET.version}_${PACKET.name}.after.sql`,
  );
  const [source, before, after] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(beforePath, "utf8"),
    readFile(afterPath, "utf8"),
  ]);
  await writeFile(
    join(migrationsDir, PACKET_FILENAME),
    `${before.trim()}\n\n${source.trim()}\n\n${after.trim()}\n`,
  );
  return workdir;
}

/** Creates the exact 32-file lane used for the post-apply schema comparison. */
async function prepareSchemaWorkdir(entries) {
  const workdir = await mkdtemp(
    join(tmpdir(), "biblequest-production-guided-schema-"),
  );
  await writeConfig(workdir, "schema");
  for (const entry of entries) {
    await copyFile(
      join(ROOT, "supabase", "migrations", entry.filename),
      join(workdir, "supabase", "migrations", entry.filename),
    );
  }
  return workdir;
}

/** Links only one disposable work directory to the frozen production target. */
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

/** Returns the exact ordered remote migration versions. */
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

/** Accepts only the reviewed pre-0033 or fully applied production history. */
function historyState(actual) {
  const reviewed = REVIEWED_HISTORY.map(([version]) => version);
  const complete = [...reviewed, PACKET.version];
  if (JSON.stringify(actual) === JSON.stringify(reviewed)) return "reviewed";
  if (JSON.stringify(actual) === JSON.stringify(complete)) return "applied";
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

/** Requires the dry run to propose exactly the one guided-progress packet. */
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
    60_000,
    true,
  );
  const filenames = [
    ...output.matchAll(/\b(20\d{12})_[a-z0-9_]+\.sql\b/g),
  ].map((match) => match[0]);
  const unique = [...new Set(filenames)];
  if (
    unique.length !== 1 ||
    unique[0] !== PACKET_FILENAME
  ) {
    fail("Dry run did not propose exactly the reviewed guided progress packet");
  }
  return unique;
}

/** Applies only the packet that already passed the exact dry-run check. */
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

/** Proves production equals a clean public schema built from all 32 files. */
function requireEmptySchemaDiff(workdir) {
  const result = parseJson(
    runSupabase(
      [
        "db",
        "diff",
        "--from",
        "migrations",
        "--to",
        "linked",
        "--schema",
        "public",
        "--use-pg-schema",
        "--workdir",
        workdir,
        "--output-format",
        "json",
      ],
      ROOT,
      15 * 60_000,
    ),
    "Schema diff",
  );
  if (
    result?.diff?.trim() !== "" ||
    JSON.stringify(result?.schemas) !== JSON.stringify(["public"])
  ) {
    fail("Production public schema differs from the frozen 32-file build");
  }
}

/** Accepts one explicit mode and rejects accidental production writes. */
function modeFromArguments(argv) {
  if (argv.length !== 1 || !["--dry-run", "--apply"].includes(argv[0])) {
    fail("Use --dry-run or --apply");
  }
  return argv[0] === "--apply" ? "apply" : "dry-run";
}

// Executes the guarded production workflow and removes both isolated lanes.
const mode = modeFromArguments(process.argv.slice(2));
if (
  mode === "apply" &&
  process.env.BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
) {
  fail("Production apply confirmation is missing");
}

let historyWorkdir;
let schemaWorkdir;
try {
  const entries = await verifyManifest();
  historyWorkdir = await prepareHistoryWorkdir();
  schemaWorkdir = await prepareSchemaWorkdir(entries);
  linkProduction(historyWorkdir);
  linkProduction(schemaWorkdir);

  const initialState = historyState(remoteHistory(historyWorkdir));
  const backupAt = latestBackup();
  let proposed = [];
  if (initialState !== "applied") {
    proposed = dryRun(historyWorkdir);
  } else if (mode === "apply") {
    fail("Reviewed production guided progress migration is already applied");
  }

  if (mode === "apply" && initialState !== "applied") {
    applyPacket(historyWorkdir);
    if (historyState(remoteHistory(historyWorkdir)) !== "applied") {
      fail("Reviewed production guided progress migration was not recorded");
    }
  }

  if (initialState === "applied" || mode === "apply") {
    requireEmptySchemaDiff(schemaWorkdir);
  }

  console.log(
    JSON.stringify({
      status: "pass",
      mode,
      project_ref: PROJECT_REF,
      manifest_files: entries.length,
      manifest_sha256: EXPECTED_MANIFEST_SHA256,
      packet: PACKET_FILENAME,
      source_sha256: PACKET.sourceSha,
      backup_at: backupAt,
      proposed,
      applied: initialState === "applied" || mode === "apply",
      schema_diff_empty: initialState === "applied" || mode === "apply",
    }),
  );
} finally {
  for (const workdir of [historyWorkdir, schemaWorkdir]) {
    if (workdir) {
      await rm(workdir, { recursive: true, force: true });
    }
  }
}
