export const GAME_KINDS = ["connections", "timeline"] as const;

export type GameKind = (typeof GAME_KINDS)[number];
export type GameStatus = "playing" | "completed" | "revealed";

export interface ScriptureSource {
  reference: string;
  bookSlug: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
}

export interface GameContentReview {
  status: "reviewed";
  scriptureNote: string;
  ambiguityNote: string;
}

export interface GameLearning {
  title: string;
  summary: string;
  sources: readonly ScriptureSource[];
  readSource: ScriptureSource;
  relatedQuestSlug?: string;
  relatedQuestLabel?:
    | "Continue studying"
    | "Pray with this Scripture"
    | "Carry this Scripture"
    | "Live this Scripture";
}

interface GamePuzzleBase {
  id: string;
  contentVersion: number;
  kind: GameKind;
  title: string;
  description: string;
  estimatedMinutes: number;
  themePack: string;
  learning: GameLearning;
  review: GameContentReview;
}

export interface ConnectionGroup {
  id: string;
  title: string;
  terms: readonly [string, string, string, string];
  explanation: string;
  sources: readonly ScriptureSource[];
}

export interface ConnectionsPuzzle extends GamePuzzleBase {
  kind: "connections";
  groups: readonly [ConnectionGroup, ConnectionGroup, ConnectionGroup];
}

export interface TimelineItem {
  id: string;
  label: string;
  explanation: string;
  source: ScriptureSource;
}

export interface TimelinePuzzle extends GamePuzzleBase {
  kind: "timeline";
  items: readonly [TimelineItem, TimelineItem, TimelineItem, TimelineItem];
}

export type GamePuzzle = ConnectionsPuzzle | TimelinePuzzle;

interface GameProgressBase {
  sessionKey: string;
  puzzleId: string;
  contentVersion: number;
  status: GameStatus;
  misses: number;
  learningEventRecorded: boolean;
  updatedAt: number;
}

export interface ConnectionsProgress extends GameProgressBase {
  kind: "connections";
  termOrder: string[];
  selectedTerms: string[];
  solvedGroupIds: string[];
}

export interface TimelineProgress extends GameProgressBase {
  kind: "timeline";
  itemOrder: string[];
  /** Correct moments already chosen, always stored as a narrative prefix. */
  selectedItemIds: string[];
}

export type GameProgress = ConnectionsProgress | TimelineProgress;

export interface GameSubmission<TProgress extends GameProgress> {
  progress: TProgress;
  announcement: string;
  nearMatch?: boolean;
}
