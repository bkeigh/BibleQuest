/**
 * Proves a configured production build embedded the public Supabase URL and
 * browser key into client JavaScript. Next.js cannot inline dynamic env reads.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const CHUNKS_DIR = join(process.cwd(), ".next", "static", "chunks");
const expectedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const expectedKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!expectedUrl || !expectedKey?.startsWith("sb_publishable_")) {
  throw new Error(
    "A modern Supabase publishable key and URL are required for bundle verification.",
  );
}

/** Returns every emitted browser JavaScript file below the chunks directory. */
async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
    }),
  );
  return nested.flat();
}

const files = await javascriptFiles(CHUNKS_DIR);
let foundUrl = false;
let foundKey = false;
const discoveredOrigins = new Set();
const discoveredPublishableKeys = new Set();

for (const file of files) {
  const source = await readFile(file, "utf8");
  foundUrl ||= source.includes(expectedUrl);
  foundKey ||= source.includes(expectedKey);
  if (
    source.includes("native-staging.biblequest.co") ||
    source.includes(".vercel.app")
  ) {
    throw new Error("Browser bundle contains a staging or Preview marker.");
  }
  if (/sb_secret_[A-Za-z0-9._-]{20,}/.test(source)) {
    throw new Error("Browser bundle contains a Supabase secret key.");
  }
  for (const origin of source.match(/https:\/\/[a-z]{20}\.supabase\.co/g) ?? []) {
    discoveredOrigins.add(origin);
  }
  for (const key of source.match(/sb_publishable_[A-Za-z0-9._-]+/g) ?? []) {
    discoveredPublishableKeys.add(key);
  }
  for (
    const candidate of
      source.match(
        /[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
      ) ?? []
  ) {
    try {
      const payload = JSON.parse(
        Buffer.from(candidate.split(".")[1], "base64url").toString("utf8"),
      );
      if (payload?.role === "service_role") {
        throw new Error("Browser bundle contains a service-role credential.");
      }
      // A legacy anonymous JWT is public by design, but shipping one keeps the
      // legacy key class alive in released bundles and defeats the point of an
      // independently rotatable publishable key. The release gate forbids it,
      // and this makes that clause self-enforcing rather than relying on which
      // environment happens to still define NEXT_PUBLIC_SUPABASE_ANON_KEY.
      if (payload?.role === "anon") {
        throw new Error("Browser bundle contains a legacy anonymous JWT.");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("service-role") ||
          error.message.includes("legacy anonymous"))
      ) {
        throw error;
      }
    }
  }
}

if (
  !foundUrl ||
  !foundKey ||
  discoveredOrigins.size !== 1 ||
  !discoveredOrigins.has(expectedUrl) ||
  discoveredPublishableKeys.size !== 1 ||
  !discoveredPublishableKeys.has(expectedKey)
) {
  throw new Error(
    "Browser bundle does not contain exactly the reviewed Supabase public target.",
  );
}

console.log("Browser bundle contains exactly the reviewed Supabase public target.");
