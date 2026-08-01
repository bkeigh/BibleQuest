import { getBookMeta } from "@/lib/bible";
import type { ScriptureSource } from "@/lib/games/types";
import { isSevenDaysTileId } from "./board";
import {
  SEVEN_DAYS_CHAPTERS,
  SEVEN_DAYS_LEVELS_PER_CHAPTER,
} from "./content";
import { SEVEN_DAYS_LEVELS } from "./levels";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Mirrors the daily-game catalogue check: a citation that does not resolve is
 * a broken promise, because every explanation offers to open the passage.
 */
function validateSource(source: ScriptureSource, context: string): string[] {
  const errors: string[] = [];
  const book = getBookMeta(source.bookSlug);
  if (!book) {
    errors.push(`${context} uses unknown book slug "${source.bookSlug}".`);
    return errors;
  }
  if (!Number.isInteger(source.chapter) || source.chapter < 1) {
    errors.push(`${context} has an invalid chapter.`);
  } else if (source.chapter > book.chapterCount) {
    errors.push(`${context} points beyond ${book.name}.`);
  }
  if (!Number.isInteger(source.verseStart) || source.verseStart < 1) {
    errors.push(`${context} has an invalid starting verse.`);
  }
  if (
    source.verseEnd !== undefined &&
    (!Number.isInteger(source.verseEnd) || source.verseEnd < source.verseStart)
  ) {
    errors.push(`${context} has an invalid ending verse.`);
  }
  const verseCount = book.verseCounts[source.chapter - 1];
  if (verseCount && (source.verseEnd ?? source.verseStart) > verseCount) {
    errors.push(`${context} points beyond the end of its chapter.`);
  }
  const expected = `${book.name} ${source.chapter}:${source.verseStart}${
    source.verseEnd && source.verseEnd !== source.verseStart
      ? `–${source.verseEnd}`
      : ""
  }`;
  if (source.reference !== expected) {
    errors.push(
      `${context} reference "${source.reference}" does not match "${expected}".`,
    );
  }
  return errors;
}

/** Collects every content problem so one bad handoff reports all of them. */
export function collectSevenDaysContentErrors(): string[] {
  const errors: string[] = [];
  const chapterIds = new Set<string>();
  const questionIds = new Set<string>();

  SEVEN_DAYS_CHAPTERS.forEach((chapter, index) => {
    const label = `Chapter ${chapter.id}`;
    if (!ID_PATTERN.test(chapter.id)) errors.push(`${label} has an invalid id.`);
    if (chapterIds.has(chapter.id)) errors.push(`${label} id is duplicated.`);
    chapterIds.add(chapter.id);
    if (chapter.day !== index + 1) {
      errors.push(`${label} is out of order; expected day ${index + 1}.`);
    }
    if (!chapter.title.trim() || !chapter.summary.trim()) {
      errors.push(`${label} needs a title and a summary.`);
    }
    if (!isSevenDaysTileId(chapter.signature)) {
      errors.push(`${label} has an unknown signature tile.`);
    }
    errors.push(...validateSource(chapter.source, `${label} source`));

    if (chapter.questions.length !== SEVEN_DAYS_LEVELS_PER_CHAPTER) {
      errors.push(
        `${label} needs one question per level (${SEVEN_DAYS_LEVELS_PER_CHAPTER}).`,
      );
    }
    chapter.questions.forEach((question) => {
      const qLabel = `${label} question ${question.id}`;
      if (!ID_PATTERN.test(question.id)) errors.push(`${qLabel} has an invalid id.`);
      if (questionIds.has(question.id)) errors.push(`${qLabel} id is duplicated.`);
      questionIds.add(question.id);
      if (!question.prompt.trim()) errors.push(`${qLabel} needs a prompt.`);
      if (!question.explanation.trim()) {
        errors.push(`${qLabel} needs an explanation; answers are never withheld.`);
      }
      if (question.options.length !== 3) {
        errors.push(`${qLabel} needs exactly three options.`);
      }
      if (new Set(question.options).size !== question.options.length) {
        errors.push(`${qLabel} repeats an option.`);
      }
      if (question.options.some((option) => !option.trim())) {
        errors.push(`${qLabel} has an empty option.`);
      }
      if (
        !Number.isInteger(question.answerIndex) ||
        question.answerIndex < 0 ||
        question.answerIndex > 2
      ) {
        errors.push(`${qLabel} has an answerIndex outside its options.`);
      }
      errors.push(...validateSource(question.source, `${qLabel} source`));
    });
  });

  const levelIds = new Set<string>();
  for (const level of SEVEN_DAYS_LEVELS) {
    const label = `Level ${level.id}`;
    if (levelIds.has(level.id)) errors.push(`${label} id is duplicated.`);
    levelIds.add(level.id);
    if (level.moves < 12) {
      errors.push(`${label} leaves too few moves to be playable.`);
    }
    if (level.tiles.length < 4) {
      errors.push(`${label} needs at least four tiles for matches to appear.`);
    }
    if (level.goals.length === 0) errors.push(`${label} has no goal.`);
    for (const goal of level.goals) {
      if (!level.tiles.includes(goal.tile)) {
        errors.push(`${label} asks for a tile that is not on its board.`);
      }
      if (goal.count < 1) errors.push(`${label} has an empty goal.`);
    }
    if (new Set(level.goals.map((goal) => goal.tile)).size !== level.goals.length) {
      errors.push(`${label} asks for the same tile twice.`);
    }
  }

  return errors;
}

/** A bad content handoff stops the build instead of reaching a reader. */
export function assertValidSevenDaysContent(): void {
  const errors = collectSevenDaysContentErrors();
  if (errors.length > 0) {
    throw new Error(`Seven Days Match content is invalid:\n- ${errors.join("\n- ")}`);
  }
}
