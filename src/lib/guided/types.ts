import type { GuidedMovementKey } from "@/lib/questos/types";

export type GuidedAccess = "free" | "plus";

export interface GuidedScripturePassage {
  bookSlug: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  reference: string;
  translationKey: "web";
  translationLabel: "World English Bible (WEB)";
  verses: string[];
}

export interface GuidedContentReview {
  status: "reviewed";
  reviewedAt: string;
  lenses: readonly ["safety", "tone", "theology"];
  scriptureSource: "bundled_web";
}

/**
 * One static guided practice. Content ids include a version so editorial
 * corrections create a new progress boundary instead of mutating history.
 */
export interface GuidedPractice {
  id: string;
  title: string;
  summary: string;
  durationMinutes: number;
  access: GuidedAccess;
  scripture: GuidedScripturePassage;
  arrive: string;
  notice: string;
  reflect: string;
  respond: string;
  prayer: string;
  reflectionPromptId: string;
  prayerPromptId: string;
  questSlug: string;
  review: GuidedContentReview;
}

export interface GuidedMovement {
  key: GuidedMovementKey;
  label: string;
  title: string;
  body: string;
}

export interface PilgrimageDefinition {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  access: GuidedAccess;
  estimatedDays: number;
  estimatedMinutesPerDay: number;
  days: readonly GuidedPractice[];
  review: GuidedContentReview;
}

/** Every practice uses one immutable six-movement order. */
export function movementsForPractice(
  practice: GuidedPractice,
): readonly GuidedMovement[] {
  return [
    {
      key: "arrive",
      label: "Arrive",
      title: "Become present",
      body: practice.arrive,
    },
    {
      key: "read",
      label: "Read",
      title: practice.scripture.reference,
      body: practice.scripture.verses.join(" "),
    },
    {
      key: "notice",
      label: "Notice",
      title: "Stay with the words",
      body: practice.notice,
    },
    {
      key: "reflect",
      label: "Reflect",
      title: "Listen inwardly",
      body: practice.reflect,
    },
    {
      key: "respond",
      label: "Respond",
      title: "Carry it into life",
      body: practice.respond,
    },
    {
      key: "pray",
      label: "Pray",
      title: "Close in prayer",
      body: practice.prayer,
    },
  ] as const;
}
