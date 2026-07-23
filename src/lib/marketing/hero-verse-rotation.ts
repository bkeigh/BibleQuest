import type { DailyVerse } from "@/lib/questos/types";

/** A slow cadence keeps the hero alive without making Scripture feel hurried. */
export const HERO_VERSE_ROTATION_MS = 9_000;

/** These concise passages represent stillness, peace, hope, and faithful action. */
export const HERO_VERSE_IDS = [
  "dv003",
  "dv006",
  "dv018",
  "dv026",
] as const;

/** Keeps today's verse first, then adds the reviewed hero passages without repeats. */
export function buildHeroVerseRotation(
  initial: DailyVerse,
  pool: readonly DailyVerse[],
): DailyVerse[] {
  const byId = new Map(pool.map((verse) => [verse.id, verse]));
  const rotation = [
    initial,
    ...HERO_VERSE_IDS.map((id) => byId.get(id)).filter(
      (verse): verse is DailyVerse => verse != null,
    ),
  ];

  return rotation.filter(
    (verse, index) =>
      rotation.findIndex((candidate) => candidate.id === verse.id) === index,
  );
}

/** Advances safely and wraps so the carousel can run indefinitely. */
export function nextHeroVerseIndex(current: number, length: number): number {
  if (!Number.isInteger(current) || length < 2) return 0;
  return (current + 1) % length;
}
