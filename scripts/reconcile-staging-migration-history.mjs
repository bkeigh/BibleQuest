/**
 * Proves staging matches the frozen 32-file manifest, then records one honest
 * forward migration without backfilling four absent short-version rows.
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
const PRIOR_PACKET_VERSION = "20260729110000";
const PACKET_VERSION = "20260729190000";
const PACKET_NAME = "reconcile_32_file_manifest";
const PACKET_FILENAME = `${PACKET_VERSION}_${PACKET_NAME}.sql`;
const EXPECTED_MANIFEST_SHA256 =
  "36f15c8c64b4e39c81f6f21ebc0e160bce9217aaba301dd9d7f5bfd5db462f43";
const EXPECTED_PACKET_SHA256 =
  "1cd4da3b7b65ec52c7f2a78c2dad9e2acf88fe0020fa750fe734aed1f3e51931";
const APPLY_CONFIRMATION = "apply staging 32-file reconciliation";

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
  "0033",
];
const UNRECORDED_VERSIONS = ["0029", "0030", "0032", "0033"];
const REVIEWED_HISTORY = EXPECTED_VERSIONS.filter(
  (version) => !UNRECORDED_VERSIONS.includes(version),
);
const SAFE_PACKET_FAILURES = [
  "staging migration prehistory is not a reviewed 0032 state",
  "staging schema contract posture is invalid",
  "staging 0029 row-size posture is invalid",
  "staging 0030 operator Plus posture is invalid",
  "staging 0031 subscription conflict posture is invalid",
  "staging 0032 dispute signal posture is invalid",
  "staging 0033 guided progress posture is invalid",
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
  const frozenManifest = `${manifest
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .slice(0, 32)
    .join("\n")}\n`;
  if (sha256(frozenManifest) !== EXPECTED_MANIFEST_SHA256) {
    fail("Frozen 32-file manifest checksum changed");
  }

  const lines = frozenManifest
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
    .sort()
    .slice(0, 32);
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

/** Creates an exact pre-0033 or final schema lane for read-only comparison. */
async function prepareSchemaWorkdir(entries, includeGuidedProgress) {
  const workdir = await mkdtemp(join(tmpdir(), "biblequest-staging-schema-"));
  await writeConfig(workdir, "schema");
  for (const entry of entries) {
    if (!includeGuidedProgress && entry.version === "0033") continue;
    await copyFile(
      join(ROOT, "supabase", "migrations", entry.filename),
      join(workdir, "supabase", "migrations", entry.filename),
    );
  }
  return workdir;
}

/** Creates the reviewed-history lane containing only one forward proposal. */
async function prepareHistoryWorkdir(entries, historyPosture) {
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
  if (
    historyPosture === "prior_attested" ||
    historyPosture === "applied_after_prior"
  ) {
    await writeFile(
      join(
        workdir,
        "supabase",
        "migrations",
        `${PRIOR_PACKET_VERSION}_reconcile_31_file_manifest.sql`,
      ),
      `-- Existing reviewed staging attestation: ${PRIOR_PACKET_VERSION}.\n`,
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

/** Creates a no-migration lane used only to inspect exact remote history. */
async function prepareHistoryProbeWorkdir() {
  const workdir = await mkdtemp(join(tmpdir(), "biblequest-staging-probe-"));
  await writeConfig(workdir, "probe");
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

/** Accepts only reviewed prehistory and the two known forward attestations. */
function historyState(actual) {
  if (JSON.stringify(actual) === JSON.stringify(REVIEWED_HISTORY)) {
    return "reviewed";
  }
  if (
    JSON.stringify(actual) ===
    JSON.stringify([...REVIEWED_HISTORY, PRIOR_PACKET_VERSION])
  ) {
    return "prior_attested";
  }
  if (
    JSON.stringify(actual) ===
    JSON.stringify([...REVIEWED_HISTORY, PACKET_VERSION])
  ) {
    return "applied";
  }
  if (
    JSON.stringify(actual) ===
    JSON.stringify([
      ...REVIEWED_HISTORY,
      PRIOR_PACKET_VERSION,
      PACKET_VERSION,
    ])
  ) {
    return "applied_after_prior";
  }
  fail("Staging migration history differs from the reviewed state");
}

/** Proves the remote schema equals the selected frozen manifest posture. */
function requireEmptySchemaDiff(workdir, includeGuidedProgress) {
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
    fail(
      includeGuidedProgress
        ? "Staging public schema differs from the frozen 32-file build"
        : "Staging public schema differs from the frozen 31-file pre-0033 build",
    );
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

let historyProbeWorkdir;
let schemaWorkdir;
let historyWorkdir;
try {
  const entries = await verifyManifest();
  const { stagingRef } = resolveTargets();
  historyProbeWorkdir = await prepareHistoryProbeWorkdir();
  linkStaging(historyProbeWorkdir, stagingRef);
  const initialHistoryState = historyState(
    remoteHistory(historyProbeWorkdir),
  );
  const alreadyApplied =
    initialHistoryState === "applied" ||
    initialHistoryState === "applied_after_prior";
  schemaWorkdir = await prepareSchemaWorkdir(entries, alreadyApplied);
  historyWorkdir = await prepareHistoryWorkdir(
    entries,
    initialHistoryState,
  );
  linkStaging(schemaWorkdir, stagingRef);
  linkStaging(historyWorkdir, stagingRef);

  requireEmptySchemaDiff(schemaWorkdir, alreadyApplied);
  let proposed = [];
  if (!alreadyApplied) {
    proposed = dryRun(historyWorkdir);
  } else if (mode === "apply") {
    fail("Reviewed staging reconciliation packet is already applied");
  }

  if (mode === "apply" && !alreadyApplied) {
    applyPacket(historyWorkdir);
    const expectedState =
      initialHistoryState === "prior_attested"
        ? "applied_after_prior"
        : "applied";
    if (historyState(remoteHistory(historyWorkdir)) !== expectedState) {
      fail("Reviewed staging reconciliation packet was not recorded");
    }
    const finalSchemaWorkdir = await prepareSchemaWorkdir(entries, true);
    try {
      linkStaging(finalSchemaWorkdir, stagingRef);
      requireEmptySchemaDiff(finalSchemaWorkdir, true);
    } finally {
      await rm(finalSchemaWorkdir, { recursive: true, force: true });
    }
  }

  const willBeApplied = alreadyApplied || mode === "apply";
  const priorAttestation =
    initialHistoryState === "prior_attested" ||
    initialHistoryState === "applied_after_prior";
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
      prior_attestation: priorAttestation,
      packet: PACKET_FILENAME,
      proposed,
      applied: willBeApplied,
      posthistory_rows:
        REVIEWED_HISTORY.length +
        (priorAttestation ? 1 : 0) +
        (willBeApplied ? 1 : 0),
      production_apply: false,
      history_repair: false,
    }),
  );
} finally {
  for (const workdir of [
    historyProbeWorkdir,
    schemaWorkdir,
    historyWorkdir,
  ]) {
    if (workdir) {
      await rm(workdir, { recursive: true, force: true });
    }
  }
}
