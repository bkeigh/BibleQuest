/** Practices a person can place inside one gentle daily rhythm. */
export const RHYTHM_PRACTICES = [
  "quest",
  "guided_scripture",
  "today_game",
  "prayer",
  "reflection",
] as const;

export type RhythmPractice = (typeof RHYTHM_PRACTICES)[number];

/** JavaScript weekday numbers keep date matching timezone-local and simple. */
export const RHYTHM_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type RhythmDay = (typeof RHYTHM_DAYS)[number];

export interface RhythmBlock {
  id: string;
  label: string;
  time: string;
  days: RhythmDay[];
  practices: RhythmPractice[];
  fallbackPractice: RhythmPractice | null;
  createdAt: string;
  updatedAt: string;
}

export interface RhythmState {
  version: 1;
  blocks: RhythmBlock[];
}

export const EMPTY_RHYTHM_STATE: RhythmState = {
  version: 1,
  blocks: [],
};

export const FREE_RHYTHM_BLOCK_LIMIT = 1;
export const PLUS_RHYTHM_BLOCK_LIMIT = 3;

export const RHYTHM_PRACTICE_LABELS: Record<RhythmPractice, string> = {
  quest: "A real-life quest",
  guided_scripture: "Guided Scripture",
  today_game: "Today’s Scripture game",
  prayer: "Private prayer",
  reflection: "Private reflection",
};

export const RHYTHM_DAY_LABELS: Record<RhythmDay, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};
