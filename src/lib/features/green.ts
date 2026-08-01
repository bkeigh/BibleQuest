/**
 * Public, build-time kill switches for the Green feature rollout.
 *
 * Features default on in this isolated branch. Production can disable the
 * whole release or one surface by setting the matching value to "false".
 */
export interface GreenFeatureFlags {
  guidedScripture: boolean;
  pilgrimages: boolean;
  games: boolean;
  scriptureConnections: boolean;
  bibleTimeline: boolean;
  sevenDaysMatch: boolean;
  rhythmBuilder: boolean;
}

/** Accepts only explicit booleans so malformed deployment values fail closed. */
export function parsePublicFeatureFlag(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return false;
}

/** Derives child flags beneath one master rollout switch. */
export function resolveGreenFeatureFlags(values: {
  master?: string;
  guidedScripture?: string;
  pilgrimages?: string;
  games?: string;
  scriptureConnections?: string;
  bibleTimeline?: string;
  sevenDaysMatch?: string;
  rhythmBuilder?: string;
}): GreenFeatureFlags {
  const master = parsePublicFeatureFlag(values.master, true);
  const enabled = (value: string | undefined) =>
    master && parsePublicFeatureFlag(value, true);
  const games = enabled(values.games);

  return {
    guidedScripture: enabled(values.guidedScripture),
    pilgrimages: enabled(values.pilgrimages),
    games,
    scriptureConnections:
      games && parsePublicFeatureFlag(values.scriptureConnections, true),
    bibleTimeline:
      games && parsePublicFeatureFlag(values.bibleTimeline, true),
    sevenDaysMatch:
      games && parsePublicFeatureFlag(values.sevenDaysMatch, true),
    rhythmBuilder: enabled(values.rhythmBuilder),
  };
}

/** Client-safe constants use explicit env reads so Next.js can inline them. */
export const GREEN_FEATURES = Object.freeze(
  resolveGreenFeatureFlags({
    master: process.env.NEXT_PUBLIC_GREEN_FEATURES_ENABLED,
    guidedScripture:
      process.env.NEXT_PUBLIC_GUIDED_SCRIPTURE_ENABLED,
    pilgrimages: process.env.NEXT_PUBLIC_PILGRIMAGES_ENABLED,
    games: process.env.NEXT_PUBLIC_SCRIPTURE_GAMES_ENABLED,
    scriptureConnections:
      process.env.NEXT_PUBLIC_SCRIPTURE_CONNECTIONS_ENABLED,
    bibleTimeline: process.env.NEXT_PUBLIC_BIBLE_TIMELINE_ENABLED,
    sevenDaysMatch: process.env.NEXT_PUBLIC_SEVEN_DAYS_MATCH_ENABLED,
    rhythmBuilder: process.env.NEXT_PUBLIC_RHYTHM_BUILDER_ENABLED,
  }),
);
