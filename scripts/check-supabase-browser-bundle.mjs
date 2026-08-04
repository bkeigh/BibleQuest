/**
 * Proves a configured production build embedded the public Supabase URL and
 * browser key into client JavaScript. Next.js cannot inline dynamic env reads.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const CHUNKS_DIR = join(process.cwd(), ".next", "static", "chunks");
const expectedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const expectedKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!expectedUrl || !expectedKey) {
  throw new Error(
    "Configured Supabase URL and browser key are required for bundle verification.",
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

for (const file of files) {
  const source = await readFile(file, "utf8");
  foundUrl ||= source.includes(expectedUrl);
  foundKey ||= source.includes(expectedKey);
  if (foundUrl && foundKey) break;
}

if (!foundUrl || !foundKey) {
  throw new Error(
    `Supabase browser configuration was not embedded (url=${foundUrl}, key=${foundKey}).`,
  );
}

console.log("Supabase browser configuration is embedded in the production bundle.");
