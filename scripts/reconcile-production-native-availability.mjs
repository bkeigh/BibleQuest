/**
 * Dry-runs or applies only the reviewed native-availability packet after
 * immutable-history, source-hash, assertion, and physical-backup gates.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT_REF = "iacnjqnssovaaojswjoh";
const FROZEN_PREFIX_SHA256 =
  "7f6f4ba507d4f314fe3965a0ed9602cce854fd370e63f1e892d34e2f08d0fa04";
const APPLY_CONFIRMATION = `apply native availability to ${PROJECT_REF}`;
const MAX_BACKUP_AGE_MS = 30 * 60 * 60 * 1000;
const PACKET = {
  version: "20260812010000",
  name: "native_account_availability",
  source: "0037_native_account_beta_availability.sql",
  sourceSha:
    "a3223eb14f18d304cd9984c410c74172a2ec04a11cea41ca11d9e491d2fa0fd8",
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
];

/** Stops without reflecting SQL, provider output, or credentials. */
function fail(message) {
  throw new Error(message);
}

/** Returns one pinned SHA-256 digest for non-secret migration content. */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Runs a bounded Supabase command with captured, non-reflected output. */
function supabase(args, cwd, includeStderr = false) {
  const result = spawnSync("supabase", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_AGENT: "yes" },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) fail(`Supabase ${args[0]} failed`);
  return includeStderr ? `${result.stdout}\n${result.stderr}` : result.stdout;
}

/** Parses one expected JSON response. */
function json(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${label} did not return JSON`);
  }
}

/** Verifies the frozen Production prefix and exact native source. */
async function releaseSource() {
  const directory = join(ROOT, "supabase", "migrations");
  const manifest = await readFile(join(directory, "manifest.sha256"), "utf8");
  const prefix = `${manifest.trim().split("\n").slice(0, 35).join("\n")}\n`;
  if (sha256(prefix) !== FROZEN_PREFIX_SHA256) {
    fail("Reviewed 35-file migration prefix changed");
  }
  const source = await readFile(join(directory, PACKET.source), "utf8");
  if (sha256(source) !== PACKET.sourceSha) {
    fail("Reviewed native-availability source changed");
  }
  return source;
}

/** Creates an isolated long-version lane matching exact Production history. */
async function prepareWorkdir(source) {
  const workdir = await mkdtemp(
    join(tmpdir(), "biblequest-native-availability-"),
  );
  const migrations = join(workdir, "supabase", "migrations");
  await mkdir(migrations, { recursive: true });
  await writeFile(
    join(workdir, "supabase", "config.toml"),
    [
      'project_id = "BibleQuest-production-native-availability"',
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
      join(migrations, `${version}_${name}.sql`),
      `-- Existing immutable production history marker: ${version} ${name}.\n`,
    );
  }
  const base = join(
    ROOT,
    "supabase",
    "production-migrations",
    `${PACKET.version}_${PACKET.name}`,
  );
  const [before, after] = await Promise.all([
    readFile(`${base}.before.sql`, "utf8"),
    readFile(`${base}.after.sql`, "utf8"),
  ]);
  const packet = `${before.trim()}\n\n${source.trim()}\n\n${after.trim()}\n`;
  await writeFile(join(migrations, PACKET_FILENAME), packet);
  return { workdir, packetSha256: sha256(packet) };
}

/** Returns only ordered remote migration versions. */
function history(workdir) {
  const result = json(
    supabase(
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

/** Accepts only exact pre-release or fully applied Production history. */
function historyState(actual) {
  const reviewed = REVIEWED_HISTORY.map(([version]) => version);
  const applied = [...reviewed, PACKET.version];
  if (JSON.stringify(actual) === JSON.stringify(reviewed)) return "reviewed";
  if (JSON.stringify(actual) === JSON.stringify(applied)) return "applied";
  fail("Production migration history differs from the reviewed release lane");
}

/** Requires a completed physical Production backup no older than 30 hours. */
function recentBackup(workdir) {
  const result = json(
    supabase(
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
  const backup = (result.backups ?? [])
    .filter(
      (item) =>
        item.status === "COMPLETED" && item.is_physical_backup === true,
    )
    .sort((left, right) =>
      right.inserted_at.localeCompare(left.inserted_at),
    )[0];
  const age = backup ? Date.now() - Date.parse(backup.inserted_at) : NaN;
  if (!Number.isFinite(age) || age < 0 || age > MAX_BACKUP_AGE_MS) {
    fail("A recent completed physical Production backup is required");
  }
  return backup.inserted_at;
}

/** Requires the dry run to propose exactly the one reviewed packet. */
function dryRun(workdir) {
  const output = supabase(
    ["db", "push", "--linked", "--dry-run", "--workdir", workdir],
    workdir,
    true,
  );
  const files = [
    ...new Set(
      [...output.matchAll(/\b(20\d{12})_[a-z0-9_]+\.sql\b/g)].map(
        (match) => match[0],
      ),
    ),
  ];
  if (JSON.stringify(files) !== JSON.stringify([PACKET_FILENAME])) {
    fail("Dry run did not propose exactly the reviewed native packet");
  }
  return files;
}

/** Accepts one explicit mode and rejects accidental Production writes. */
function requestedMode(arguments_) {
  if (
    arguments_.length !== 1 ||
    !["--dry-run", "--apply"].includes(arguments_[0])
  ) {
    fail("Use --dry-run or --apply");
  }
  return arguments_[0] === "--apply" ? "apply" : "dry-run";
}

const mode = requestedMode(process.argv.slice(2));
if (
  mode === "apply" &&
  process.env.BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
) {
  fail("Production apply confirmation is missing");
}

let workdir;
try {
  const prepared = await prepareWorkdir(await releaseSource());
  workdir = prepared.workdir;
  supabase(
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
  const state = historyState(history(workdir));
  const backupAt = recentBackup(workdir);
  const proposed = state === "reviewed" ? dryRun(workdir) : [];
  if (mode === "apply") {
    if (state === "applied") fail("Reviewed native packet is already applied");
    supabase(
      ["db", "push", "--linked", "--workdir", workdir, "--yes"],
      workdir,
    );
    if (historyState(history(workdir)) !== "applied") {
      fail("Production did not record the reviewed native packet");
    }
  }
  console.log(
    JSON.stringify({
      status: "pass",
      mode,
      project_ref: PROJECT_REF,
      migration_source_sha256: PACKET.sourceSha,
      production_packet_sha256: prepared.packetSha256,
      backup_at: backupAt,
      proposed,
      applied: state === "applied" || mode === "apply",
    }),
  );
} finally {
  if (workdir) await rm(workdir, { recursive: true, force: true });
}
