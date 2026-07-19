/**
 * Emit supabase/seed.sql and its exact-content manifest from the same checked-in
 * content the app ships.
 * Optional legacy seed-result input is supported for rebuilding the 84 core
 * records; the reviewed expansion, milestones, and WEB snapshots remain local.
 *
 * Run: node scripts/build-supabase-seed.mjs [seed-result.json]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const seedDir = path.join(root, "src/data/seed");
const bibleDir = path.join(root, "src/data/bible");

function generatedArray(file, symbol) {
  const source = readFileSync(file, "utf8");
  const symbolAt = source.indexOf(symbol);
  const equalsAt = source.indexOf("=", symbolAt);
  const start = source.indexOf("[", equalsAt);
  if (symbolAt < 0 || equalsAt < 0 || start < 0) {
    throw new Error(`Could not find ${symbol} in ${file}`);
  }
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "[") depth += 1;
    else if (char === "]" && --depth === 0) {
      return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error(`Unterminated ${symbol} array in ${file}`);
}

const coreFromApp = generatedArray(path.join(seedDir, "quests.ts"), "coreSeedQuests");
const expansion = generatedArray(
  path.join(seedDir, "quest-expansion.ts"),
  "questExpansion",
);
const legacyPath = process.argv[2];
const legacy = legacyPath && existsSync(legacyPath)
  ? JSON.parse(readFileSync(legacyPath, "utf8"))
  : null;

function normalizeQuest(quest) {
  return {
    slug: quest.slug,
    title: quest.title,
    category: quest.category,
    durationMinutes: quest.durationMinutes ?? quest.duration_minutes,
    difficulty: quest.difficulty,
    energyLevel: quest.energyLevel ?? quest.energy_level,
    soloOrSocial: quest.soloOrSocial ?? quest.solo_or_social,
    indoorOrOutdoor: quest.indoorOrOutdoor ?? quest.indoor_or_outdoor,
    invitation: quest.invitation,
    whyItMatters: quest.whyItMatters ?? quest.why_it_matters,
    scriptureReference: quest.scriptureReference ?? quest.scripture_reference,
    reflectionPrompt: quest.reflectionPrompt ?? quest.reflection_prompt,
    prayerPrompt: quest.prayerPrompt ?? quest.prayer_prompt,
    growthType: quest.growthType ?? quest.growth_type,
    tags: quest.tags ?? [],
    seasonTags: quest.seasonTags ?? quest.season_tags ?? [],
    traditionTags: quest.traditionTags ?? quest.tradition_tags ?? [],
    sensitivityTags: quest.sensitivityTags ?? quest.sensitivity_tags ?? [],
    isPremium: quest.isPremium ?? quest.is_premium ?? false,
  };
}

const core = (legacy?.quests ?? coreFromApp).map(normalizeQuest);
const questMap = new Map(
  [...core, ...expansion.map(normalizeQuest)].map((quest) => [quest.slug, quest]),
);
const quests = [...questMap.values()];
const milestones = generatedArray(path.join(seedDir, "milestones.ts"), "seedMilestones");
const prayerPrompts = legacy?.prayerPrompts ?? generatedArray(
  path.join(seedDir, "prayer-prompts.ts"),
  "prayerPrompts",
);
const reflectionPrompts = legacy?.reflectionPrompts ?? generatedArray(
  path.join(seedDir, "reflection-prompts.ts"),
  "reflectionPrompts",
);
const daily = JSON.parse(readFileSync(path.join(seedDir, "daily-verses.json"), "utf8"));

if (quests.length !== 150 || new Set(quests.map((quest) => quest.slug)).size !== 150) {
  throw new Error(`Console seed requires exactly 150 unique quests; found ${quests.length}`);
}
if (daily.length !== 180) throw new Error(`Console seed requires 180 daily verses; found ${daily.length}`);
if (
  milestones.length !== 38 ||
  new Set(milestones.map((item) => item.key)).size !== 38
) {
  throw new Error(`Console seed requires exactly 38 unique milestones; found ${milestones.length}`);
}
if (
  prayerPrompts.length !== 32 ||
  new Set(prayerPrompts.map((item) => item.id ?? item.key)).size !== 32
) {
  throw new Error(`Console seed requires exactly 32 unique prayer prompts; found ${prayerPrompts.length}`);
}
if (
  reflectionPrompts.length !== 32 ||
  new Set(reflectionPrompts.map((item) => item.id ?? item.key)).size !== 32
) {
  throw new Error(`Console seed requires exactly 32 unique reflection prompts; found ${reflectionPrompts.length}`);
}

const bookMeta = JSON.parse(readFileSync(path.join(bibleDir, "books.json"), "utf8"));
const byName = new Map(bookMeta.map((book) => [book.name.toLowerCase(), book]));
byName.set("psalm", byName.get("psalms"));
const bookCache = new Map();
function exactWeb(reference) {
  const match = reference.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) throw new Error(`Unparseable quest reference: ${reference}`);
  const [, rawName, rawChapter, rawStart, rawEnd] = match;
  const meta = byName.get(rawName.toLowerCase());
  if (!meta) throw new Error(`Unknown quest-reference book: ${rawName}`);
  if (!bookCache.has(meta.slug)) {
    bookCache.set(
      meta.slug,
      JSON.parse(readFileSync(path.join(bibleDir, `${meta.slug}.json`), "utf8")),
    );
  }
  const chapter = Number(rawChapter);
  const start = Number(rawStart);
  const end = Number(rawEnd ?? rawStart);
  const verses = bookCache.get(meta.slug).chapters[chapter - 1];
  const text = verses?.slice(start - 1, end).join(" ").trim();
  if (!text || end > verses.length) throw new Error(`Missing WEB text: ${reference}`);
  return text;
}

function contentHash(record) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

function manifestTable(fields, records, naturalKey) {
  const entries = records.map((record) => [naturalKey(record), contentHash(record)]);
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw new Error("Seed manifest natural keys must be unique");
  }
  const hashes = Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  );
  return { fields, hashes };
}

const questFields = [
  "slug", "title", "category", "duration_minutes", "difficulty",
  "energy_level", "solo_or_social", "indoor_or_outdoor", "invitation",
  "why_it_matters", "scripture_reference", "scripture_text_snapshot",
  "reflection_prompt", "prayer_prompt", "growth_type", "tags",
  "season_tags", "tradition_tags", "sensitivity_tags", "is_premium",
  "is_active", "review_status",
];
const questRecords = quests.map((item) => ({
  slug: item.slug,
  title: item.title,
  category: item.category,
  duration_minutes: item.durationMinutes,
  difficulty: item.difficulty,
  energy_level: item.energyLevel,
  solo_or_social: item.soloOrSocial,
  indoor_or_outdoor: item.indoorOrOutdoor,
  invitation: item.invitation,
  why_it_matters: item.whyItMatters,
  scripture_reference: item.scriptureReference,
  scripture_text_snapshot: exactWeb(item.scriptureReference),
  reflection_prompt: item.reflectionPrompt,
  prayer_prompt: item.prayerPrompt,
  growth_type: item.growthType,
  tags: item.tags,
  season_tags: item.seasonTags,
  tradition_tags: item.traditionTags,
  sensitivity_tags: item.sensitivityTags,
  is_premium: item.isPremium,
  is_active: true,
  review_status: "approved",
}));

const dailyFields = [
  "reference", "book_slug", "chapter", "verse_start", "verse_end", "text",
  "theme", "is_active",
];
const dailyRecords = daily.map((item) => ({
  reference: item.reference,
  book_slug: item.bookSlug,
  chapter: item.chapter,
  verse_start: item.verseStart,
  verse_end: item.verseEnd,
  text: item.text,
  theme: item.theme,
  is_active: true,
}));

const milestoneFields = [
  "key", "title", "description", "milestone_type", "requirement_metric",
  "requirement_count", "icon_key", "is_active",
];
const milestoneRecords = milestones.map((item) => ({
  key: item.key,
  title: item.title,
  description: item.description,
  milestone_type: item.milestoneType ?? item.milestone_type,
  requirement_metric: item.requirementMetric ?? item.requirement_metric,
  requirement_count: item.requirementCount ?? item.requirement_count,
  icon_key: item.iconKey ?? item.icon_key,
  is_active: true,
}));

const prayerFields = ["key", "text", "category", "is_active"];
const prayerRecords = prayerPrompts.map((item) => ({
  key: item.id ?? item.key,
  text: item.text,
  category: item.category,
  is_active: true,
}));

const reflectionFields = ["key", "text", "context", "is_active"];
const reflectionRecords = reflectionPrompts.map((item) => ({
  key: item.id ?? item.key,
  text: item.text,
  context: item.context,
  is_active: true,
}));

const manifest = {
  version: 1,
  algorithm: "sha256-json-v1",
  tables: {
    quest_templates: manifestTable(questFields, questRecords, (row) => row.slug),
    daily_verses: manifestTable(
      dailyFields,
      dailyRecords,
      (row) => `${row.book_slug}:${row.chapter}:${row.verse_start}:${row.verse_end}`,
    ),
    milestones: manifestTable(milestoneFields, milestoneRecords, (row) => row.key),
    prayer_prompts: manifestTable(prayerFields, prayerRecords, (row) => row.key),
    reflection_prompts: manifestTable(
      reflectionFields,
      reflectionRecords,
      (row) => row.key,
    ),
  },
};

const sql = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replaceAll("'", "''")}'`;
};
const sqlArray = (items) => items?.length
  ? `array[${items.map(sql).join(", ")} ]::text[]`
  : "'{}'::text[]";

let output = `-- BibleQuest Console seed — AUTO-GENERATED by scripts/build-supabase-seed.mjs
-- Mirrors the launch app: 150 reviewed quests, 180 daily WEB passages,
-- ${milestones.length} milestones. Apply migrations before this seed.

begin;

insert into faith_providers (key, name, description, canonical_text_label, is_active)
values ('christianity', 'BibleQuest', 'A peaceful Christian spiritual companion.', 'Bible', true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  canonical_text_label = excluded.canonical_text_label,
  is_active = excluded.is_active;

insert into bible_translations (faith_provider_id, key, name, abbreviation, copyright_status, license_notes, is_default, is_active)
select id, 'web', 'World English Bible', 'WEB', 'public_domain', 'Public Domain. No license required.', true, true
from faith_providers where key = 'christianity'
on conflict (key) do update set
  faith_provider_id = excluded.faith_provider_id,
  name = excluded.name,
  abbreviation = excluded.abbreviation,
  copyright_status = excluded.copyright_status,
  license_notes = excluded.license_notes,
  is_default = excluded.is_default,
  is_active = excluded.is_active;

insert into feature_flags (key, description, enabled) values
  ('ai_guide', 'External AI study companion (not configured)', false),
  ('personalized_quests', 'Plus reviewed-catalog quest generator', true),
  ('external_quest_generation', 'External provider quest generation (not configured)', false),
  ('advanced_reading_plans', 'Guided reading plans', false),
  ('premium_themes', 'Premium seasonal themes', false),
  ('voice_journaling', 'Voice journaling', false),
  ('reflection_insights', 'Reflection insights over time', false),
  ('year_in_review', 'Year in Review', false),
  ('family_groups', 'Family prayer circles', false)
on conflict (key) do update set
  description = excluded.description,
  enabled = excluded.enabled;

`;

output += "-- Milestones\ninsert into milestones (key, title, description, milestone_type, requirement_metric, requirement_count, icon_key, is_active) values\n";
output += milestones.map((item) =>
  `  (${sql(item.key)}, ${sql(item.title)}, ${sql(item.description)}, ${sql(item.milestoneType ?? item.milestone_type)}, ${sql(item.requirementMetric ?? item.requirement_metric)}, ${item.requirementCount ?? item.requirement_count}, ${sql(item.iconKey ?? item.icon_key)}, true)`
).join(",\n");
output += `
on conflict (key) do update set
  title = excluded.title, description = excluded.description,
  milestone_type = excluded.milestone_type,
  requirement_metric = excluded.requirement_metric,
  requirement_count = excluded.requirement_count, icon_key = excluded.icon_key,
  is_active = excluded.is_active;

`;

output += "-- Prayer prompts\ninsert into prayer_prompts (key, text, category, is_active) values\n";
output += prayerPrompts.map((item) =>
  `  (${sql(item.id ?? item.key)}, ${sql(item.text)}, ${sql(item.category)}, true)`
).join(",\n");
output += "\non conflict (key) do update set text = excluded.text, category = excluded.category, is_active = excluded.is_active;\n\n";

output += "-- Reflection prompts\ninsert into reflection_prompts (key, text, context, is_active) values\n";
output += reflectionPrompts.map((item) =>
  `  (${sql(item.id ?? item.key)}, ${sql(item.text)}, ${sql(item.context)}, true)`
).join(",\n");
output += "\non conflict (key) do update set text = excluded.text, context = excluded.context, is_active = excluded.is_active;\n\n";

output += "-- Daily verse pool\ninsert into daily_verses (reference, book_slug, chapter, verse_start, verse_end, text, theme, is_active) values\n";
output += daily.map((item) =>
  `  (${sql(item.reference)}, ${sql(item.bookSlug)}, ${item.chapter}, ${item.verseStart}, ${item.verseEnd}, ${sql(item.text)}, ${sql(item.theme)}, true)`
).join(",\n");
output += `
on conflict (book_slug, chapter, verse_start, verse_end) do update set
  reference = excluded.reference, text = excluded.text,
  theme = excluded.theme, is_active = excluded.is_active;

`;

output += `-- Quest templates (all launch quests remain spiritually complete and free)
insert into quest_templates (faith_provider_id, slug, title, category, duration_minutes, difficulty, energy_level, solo_or_social, indoor_or_outdoor, invitation, why_it_matters, scripture_reference, scripture_text_snapshot, reflection_prompt, prayer_prompt, growth_type, tags, season_tags, tradition_tags, sensitivity_tags, is_premium, is_active, review_status)
select provider.id, value.slug, value.title, value.category, value.duration_minutes, value.difficulty, value.energy_level, value.solo_or_social, value.indoor_or_outdoor, value.invitation, value.why_it_matters, value.scripture_reference, value.scripture_text_snapshot, value.reflection_prompt, value.prayer_prompt, value.growth_type, value.tags, value.season_tags, value.tradition_tags, value.sensitivity_tags, value.is_premium, value.is_active, value.review_status
from faith_providers provider, (values
`;
output += quests.map((item) =>
  `  (${sql(item.slug)}, ${sql(item.title)}, ${sql(item.category)}, ${item.durationMinutes}, ${sql(item.difficulty)}, ${sql(item.energyLevel)}, ${sql(item.soloOrSocial)}, ${sql(item.indoorOrOutdoor)}, ${sql(item.invitation)}, ${sql(item.whyItMatters)}, ${sql(item.scriptureReference)}, ${sql(exactWeb(item.scriptureReference))}, ${sql(item.reflectionPrompt)}, ${sql(item.prayerPrompt)}, ${sql(item.growthType)}, ${sqlArray(item.tags)}, ${sqlArray(item.seasonTags)}, ${sqlArray(item.traditionTags)}, ${sqlArray(item.sensitivityTags)}, ${sql(item.isPremium)}, true, 'approved')`
).join(",\n");
output += `
) as value(slug, title, category, duration_minutes, difficulty, energy_level, solo_or_social, indoor_or_outdoor, invitation, why_it_matters, scripture_reference, scripture_text_snapshot, reflection_prompt, prayer_prompt, growth_type, tags, season_tags, tradition_tags, sensitivity_tags, is_premium, is_active, review_status)
where provider.key = 'christianity'
on conflict (slug) do update set
  faith_provider_id = excluded.faith_provider_id,
  title = excluded.title, category = excluded.category,
  duration_minutes = excluded.duration_minutes, difficulty = excluded.difficulty,
  energy_level = excluded.energy_level, solo_or_social = excluded.solo_or_social,
  indoor_or_outdoor = excluded.indoor_or_outdoor, invitation = excluded.invitation,
  why_it_matters = excluded.why_it_matters,
  scripture_reference = excluded.scripture_reference,
  scripture_text_snapshot = excluded.scripture_text_snapshot,
  reflection_prompt = excluded.reflection_prompt, prayer_prompt = excluded.prayer_prompt,
  growth_type = excluded.growth_type, tags = excluded.tags,
  season_tags = excluded.season_tags, tradition_tags = excluded.tradition_tags,
  sensitivity_tags = excluded.sensitivity_tags, is_premium = excluded.is_premium,
  is_active = excluded.is_active, review_status = excluded.review_status,
  updated_at = now();

commit;
`;

writeFileSync(path.join(root, "supabase/seed.sql"), output);
writeFileSync(
  path.join(root, "supabase/seed-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote Console seed: ${quests.length} quests, ${daily.length} daily verses, ` +
  `${prayerPrompts.length} prayer prompts, ${reflectionPrompts.length} reflection prompts, ` +
  `${milestones.length} milestones.`,
);
