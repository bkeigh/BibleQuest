/**
 * Proves staging matches the frozen 31-file manifest, then records one honest
 * forward-only attestation without backfilling the three absent history rows.
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
const STAGING_PROJECT_NAME = "BibleQuest-Account-Sync-Staging";
const PRODUCTION_PROJECT_NAME = "BibleQuest";
const PACKET_VERSION = "20260729110000";
const PACKET_NAME = "reconcile_31_file_manifest";
const PACKET_FILENAME = `${PACKET_VERSION}_${PACKET_NAME}.sql`;
const EXPECTED_MANIFEST_SHA256 =
  "1c920b04e155ce593cea485f97a6bf1466a97a6df3750a4eb4bb635926802e28";
const EXPECTED_PACKET_SHA256 =
  "571d5f09006c60c4475f74f168a0311525e39ba34a6dc5ffb7c466c54d2e29f4";
const APPLY_CONFIRMATION = "apply staging 31-file reconciliation";

const EXPECTED_VERSIONS = [
  "0001",
  "0002",
  "0003",
  "0004",
  "0005",
  "0006",
  "0007",
  "0008",
  "0009",
  "0010",
  "0011",
  "0012",
  "0014",
  "0015",
  "0016",
  "0017",
  "0018",
  "0019",
  "0020",
  "0021",
  "0022",
  "0023",
  "0024",
  "0025",
  "0026",
  "0027",
  "0028",
  "0029",
  "0030",
  "0031",
  "0032",
];
const UNRECORDED_VERSIONS = ["0029", "0030", "0032"];
const REVIEWED_HISTORY = EXPECTED_VERSIONS.filter(
  (version) => !UNRECORDED_VERSIONS.includes(version),
);
const SAFE_PACKET_FAILURES = [
  "staging migration prehistory is not the reviewed 28-row state",
  "staging schema contract posture is invalid",
  "staging 0029 row-size posture is invalid",
  "staging 0030 operator Plus posture is invalid",
  "staging 0031 subscription conflict posture is invalid",
  "staging 0032 dispute signal posture is invalid",
];

/** Fails with a bounded message that never reflects identifiers or SQL. */
function fail(message) {
  throw new Error(message);
}

/** Hashes one string or buffer with the frozen manifest algorithm. */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Returns only a reviewed packet assertion from otherwise hidden diagnostics. */
function safePacketFailure(stderr) {
  return SAFE_PACKET_FAILURES.find((message) => stderr.includes(message));
}

/** Runs one bounded Supabase command without exposing captured diagnostics. */
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
    const packetFailure = safePacketFailure(result.stderr);
    fail(
      packetFailure
        ? `Supabase ${args[0]} failed: ${packetFailure}`
        : `Supabase ${args[0]} failed`,
    );
  }
  return includeStderr
    ? `${result.stdout}\n${result.stderr}`
    : result.stdout;
}

/** Parses the JSON returned by a guarded Supabase CLI command. */
function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${label} did not return JSON`);
  }
}

/** Requires one exact healthy staging target and a distinct production target. */
function resolveTargets() {
  const projects = parseJson(
    runSupabase(["projects", "list", "--output", "json"]),
    "Project list",
  );
  if (!Array.isArray(projects)) {
    fail("Project list is missing projects");
  }

  const exactHealthy = (name) =>
    projects.filter(
      (project) =>
        project?.name === name && project?.status === "ACTIVE_HEALTHY",
    );
  const staging = exactHealthy(STAGING_PROJECT_NAME);
  const production = exactHealthy(PRODUCTION_PROJECT_NAME);
  if (staging.length !== 1) {
    fail("Exact healthy staging project count is not one");
  }
  if (production.length !== 1) {
    fail("Exact healthy production project count is not one");
  }
  if (!staging[0].id || staging[0].id === production[0].id) {
    fail("Staging target is not distinct from production");
  }
  return { stagingRef: staging[0].id };
}

/** Verifies the exact file set, manifest hash, and every migration checksum. */
async function verifyManifest() {
  const migrationsDir = join(ROOT, "supabase", "migrations");
  const manifestPath = join(migrationsDir, "manifest.sha256");
  const manifest = await readFile(manifestPath);
  if (sha256(manifest) !== EXPECTED_MANIFEST_SHA256) {
    fail("Frozen 31-file manifest checksum changed");
  }

  const lines = manifest
    .toString("utf8")
    .split("\n")
    .filter(Boolean);
  const entries = lines.map((line) => {
    const match = line.match(
      /^([a-f0-9]{64})  ((\d{4})_[a-z0-9_]+\.sql)$/,
    );
    if (!match) fail("Frozen manifest contains an invalid entry");
    return { checksum: match[1], filename: match[2], version: match[3] };
  });
  if (
    JSON.stringify(entries.map((entry) => entry.version)) !==
    JSON.stringify(EXPECTED_VERSIONS)
  ) {
    fail("Frozen manifest version sequence changed");
  }

  const actualFiles = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const manifestFiles = entries.map((entry) => entry.filename);
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) {
    fail("Migration file set differs from the frozen manifest");
  }

  for (const entry of entries) {
    const source = await readFile(join(migrationsDir, entry.filename));
    if (sha256(source) !== entry.checksum) {
      fail(`Migration ${entry.version} checksum changed`);
    }
  }
  return entries;
}

/** Writes the minimal Supabase config used by disposable work directories. */
async function writeConfig(workdir, suffix) {
  const supabaseDir = join(workdir, "supabase");
  await mkdir(join(supabaseDir, "migrations"), { recursive: true });
  await writeFile(
    join(supabaseDir, "config.toml"),
    [
      `project_id = "BibleQuest-staging-${suffix}"`,
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

/** Creates a clean 31-file lane used only for read-only schema comparison. */
async function prepareSchemaWorkdir(entries) {
  const workdir = await mkdtemp(join(tmpdir(), "biblequest-staging-schema-"));
  await writeConfig(workdir, "schema");
  for (const entry of entries) {
    await copyFile(
      join(ROOT, "supabase", "migrations", entry.filename),
      join(workdir, "supabase", "migrations", entry.filename),
    );
  }
  return workdir;
}

/** Creates the reviewed-history lane containing only one forward proposal. */
async function prepareHistoryWorkdir(entries) {
  const workdir = await mkdtemp(join(tmpdir(), "biblequest-staging-history-"));
  await writeConfig(workdir, "history");
  for (const version of REVIEWED_HISTORY) {
    const entry = entries.find((candidate) => candidate.version === version);
    if (!entry) fail(`Reviewed history marker ${version} is missing`);
    await writeFile(
      join(workdir, "supabase", "migrations", entry.filename),
      `-- Existing immutable staging history marker: ${version}.\n`,
    );
  }

  const packetPath = join(
    ROOT,
    "supabase",
    "staging-migrations",
    PACKET_FILENAME,
  );
  const packet = await readFile(packetPath);
  if (sha256(packet) !== EXPECTED_PACKET_SHA256) {
    fail("Reviewed staging reconciliation packet checksum changed");
  }
  await writeFile(
    join(workdir, "supabase", "migrations", PACKET_FILENAME),
    packet,
  );
  return workdir;
}

/** Links only one disposable work directory to the resolved staging target. */
function linkStaging(workdir, stagingRef) {
  runSupabase([
    "link",
    "--project-ref",
    stagingRef,
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

/** Accepts only the exact reviewed prehistory or its one-marker successor. */
function historyState(actual) {
  if (JSON.stringify(actual) === JSON.stringify(REVIEWED_HISTORY)) {
    return "reviewed";
  }
  if (
    JSON.stringify(actual) ===
    JSON.stringify([...REVIEWED_HISTORY, PACKET_VERSION])
  ) {
    return "applied";
  }
  fail("Staging migration history differs from the reviewed state");
}

/** Proves the remote public schema equals a clean build of all 31 files. */
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
    fail("Staging public schema differs from the frozen 31-file build");
  }
}

/** Requires the CLI dry run to propose exactly the one attestation packet. */
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
  if (unique.length !== 1 || unique[0] !== PACKET_FILENAME) {
    fail("Dry run did not propose exactly the reviewed staging packet");
  }
  return unique;
}

/** Applies the already-reviewed packet through normal migration bookkeeping. */
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

/** Accepts one explicit mode and rejects accidental staging writes. */
function modeFromArguments(argv) {
  if (argv.length !== 1 || !["--dry-run", "--apply"].includes(argv[0])) {
    fail("Use --dry-run or --apply");
  }
  return argv[0] === "--apply" ? "apply" : "dry-run";
}

// Executes the guarded staging lane and always removes both work directories.
const mode = modeFromArguments(process.argv.slice(2));
if (
  mode === "apply" &&
  process.env.BIBLEQUEST_STAGING_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
) {
  fail("Staging apply confirmation is missing");
}

let schemaWorkdir;
let historyWorkdir;
try {
  const entries = await verifyManifest();
  const { stagingRef } = resolveTargets();
  schemaWorkdir = await prepareSchemaWorkdir(entries);
  historyWorkdir = await prepareHistoryWorkdir(entries);
  linkStaging(schemaWorkdir, stagingRef);
  linkStaging(historyWorkdir, stagingRef);

  requireEmptySchemaDiff(schemaWorkdir);
  const initialHistoryState = historyState(remoteHistory(historyWorkdir));
  let proposed = [];
  if (initialHistoryState === "reviewed") {
    proposed = dryRun(historyWorkdir);
  } else if (mode === "apply") {
    fail("Reviewed staging reconciliation packet is already applied");
  }

  if (mode === "apply" && initialHistoryState === "reviewed") {
    applyPacket(historyWorkdir);
    if (historyState(remoteHistory(historyWorkdir)) !== "applied") {
      fail("Reviewed staging reconciliation packet was not recorded");
    }
    requireEmptySchemaDiff(schemaWorkdir);
  }

  console.log(
    JSON.stringify({
      status: "pass",
      mode,
      target: STAGING_PROJECT_NAME,
      manifest_files: entries.length,
      manifest_sha256: EXPECTED_MANIFEST_SHA256,
      schema_diff_empty: true,
      prehistory_rows: REVIEWED_HISTORY.length,
      unrecorded_manifest_versions: UNRECORDED_VERSIONS,
      packet: PACKET_FILENAME,
      proposed,
      applied: initialHistoryState === "applied" || mode === "apply",
      posthistory_rows:
        initialHistoryState === "applied" || mode === "apply" ? 29 : 28,
      production_apply: false,
      history_repair: false,
    }),
  );
} finally {
  for (const workdir of [schemaWorkdir, historyWorkdir]) {
    if (workdir) {
      await rm(workdir, { recursive: true, force: true });
    }
  }
}
