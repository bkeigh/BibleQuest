import { getBookMeta } from "@/lib/bible";
import type {
  ConnectionsPuzzle,
  GamePuzzle,
  ScriptureSource,
  TimelinePuzzle,
} from "./types";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validates a source deeply enough for safe chapter-reader links. */
function validateSource(source: ScriptureSource, context: string): string[] {
  const errors: string[] = [];
  const book = getBookMeta(source.bookSlug);
  if (!book) errors.push(`${context} uses unknown book slug "${source.bookSlug}".`);
  if (!Number.isInteger(source.chapter) || source.chapter < 1) {
    errors.push(`${context} has an invalid chapter.`);
  } else if (book && source.chapter > book.chapterCount) {
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
  const verseCount = book?.verseCounts[source.chapter - 1];
  if (verseCount && (source.verseEnd ?? source.verseStart) > verseCount) {
    errors.push(`${context} points beyond the end of its chapter.`);
  }
  if (!source.reference.trim()) {
    errors.push(`${context} needs an exact reference.`);
  } else if (book) {
    const expectedReference = `${book.name} ${source.chapter}:${source.verseStart}${
      source.verseEnd && source.verseEnd !== source.verseStart
        ? `–${source.verseEnd}`
        : ""
    }`;
    if (source.reference !== expectedReference) {
      errors.push(
        `${context} reference "${source.reference}" does not match "${expectedReference}".`,
      );
    }
  }
  return errors;
}

function validateBase(
  puzzle: GamePuzzle,
  questSlugs?: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  if (!ID_PATTERN.test(puzzle.id)) errors.push(`Puzzle id "${puzzle.id}" is invalid.`);
  if (!Number.isInteger(puzzle.contentVersion) || puzzle.contentVersion < 1) {
    errors.push(`${puzzle.id} needs a positive contentVersion.`);
  }
  if (!puzzle.title.trim() || !puzzle.description.trim()) {
    errors.push(`${puzzle.id} needs a title and description.`);
  }
  if (
    !Number.isInteger(puzzle.estimatedMinutes) ||
    puzzle.estimatedMinutes < 1 ||
    puzzle.estimatedMinutes > 15
  ) {
    errors.push(`${puzzle.id} needs a calm, bounded duration.`);
  }
  if (puzzle.review.status !== "reviewed") {
    errors.push(`${puzzle.id} has not completed content review.`);
  }
  if (puzzle.review.scriptureNote.trim().length < 24) {
    errors.push(`${puzzle.id} needs a meaningful Scripture review note.`);
  }
  if (puzzle.review.ambiguityNote.trim().length < 24) {
    errors.push(`${puzzle.id} needs a meaningful ambiguity review note.`);
  }
  if (!puzzle.learning.title.trim() || puzzle.learning.summary.trim().length < 40) {
    errors.push(`${puzzle.id} needs a substantive sourced learning card.`);
  }
  if (puzzle.learning.sources.length === 0) {
    errors.push(`${puzzle.id} learning card needs at least one source.`);
  }
  puzzle.learning.sources.forEach((source, index) => {
    errors.push(...validateSource(source, `${puzzle.id} learning source ${index + 1}`));
  });
  errors.push(...validateSource(puzzle.learning.readSource, `${puzzle.id} read source`));
  if (
    puzzle.learning.relatedQuestSlug &&
    questSlugs &&
    !questSlugs.has(puzzle.learning.relatedQuestSlug)
  ) {
    errors.push(
      `${puzzle.id} points to unknown quest "${puzzle.learning.relatedQuestSlug}".`,
    );
  }
  if (
    Boolean(puzzle.learning.relatedQuestSlug) !==
    Boolean(puzzle.learning.relatedQuestLabel)
  ) {
    errors.push(
      `${puzzle.id} needs both a related quest slug and an honest CTA label.`,
    );
  }
  return errors;
}

function validateConnections(puzzle: ConnectionsPuzzle): string[] {
  const errors: string[] = [];
  if (puzzle.groups.length !== 3) {
    errors.push(`${puzzle.id} must contain exactly three groups.`);
  }
  const groupIds = new Set<string>();
  const groupTitles = new Set<string>();
  const terms = new Set<string>();
  for (const group of puzzle.groups) {
    if (!ID_PATTERN.test(group.id) || groupIds.has(group.id)) {
      errors.push(`${puzzle.id} has a missing or duplicate group id "${group.id}".`);
    }
    groupIds.add(group.id);
    const normalizedTitle = group.title.trim().toLocaleLowerCase();
    if (!normalizedTitle || groupTitles.has(normalizedTitle)) {
      errors.push(`${puzzle.id} has a missing or duplicate group title.`);
    }
    groupTitles.add(normalizedTitle);
    if (group.terms.length !== 4) {
      errors.push(`${puzzle.id}/${group.id} must contain exactly four terms.`);
    }
    for (const term of group.terms) {
      const normalizedTerm = term.trim().toLocaleLowerCase();
      if (!normalizedTerm || terms.has(normalizedTerm)) {
        errors.push(
          `${puzzle.id} has the ambiguous duplicate term "${term}".`,
        );
      }
      terms.add(normalizedTerm);
    }
    if (group.explanation.trim().length < 35) {
      errors.push(`${puzzle.id}/${group.id} needs a learning explanation.`);
    }
    if (group.sources.length === 0) {
      errors.push(`${puzzle.id}/${group.id} needs at least one source.`);
    }
    group.sources.forEach((source, index) => {
      errors.push(
        ...validateSource(source, `${puzzle.id}/${group.id} source ${index + 1}`),
      );
    });
  }
  if (terms.size !== 12) errors.push(`${puzzle.id} must contain 12 unique terms.`);
  return errors;
}

function validateTimeline(puzzle: TimelinePuzzle): string[] {
  const errors: string[] = [];
  if (puzzle.items.length !== 4) {
    errors.push(`${puzzle.id} must contain exactly four ordered items.`);
  }
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const item of puzzle.items) {
    if (!ID_PATTERN.test(item.id) || ids.has(item.id)) {
      errors.push(`${puzzle.id} has a missing or duplicate item id "${item.id}".`);
    }
    ids.add(item.id);
    const normalizedLabel = item.label.trim().toLocaleLowerCase();
    if (!normalizedLabel || labels.has(normalizedLabel)) {
      errors.push(`${puzzle.id} has a missing or duplicate timeline label.`);
    }
    labels.add(normalizedLabel);
    if (item.explanation.trim().length < 30) {
      errors.push(`${puzzle.id}/${item.id} needs a learning explanation.`);
    }
    errors.push(...validateSource(item.source, `${puzzle.id}/${item.id} source`));
  }
  return errors;
}

/** Rejects malformed, unsourced, duplicate, or manually unreviewed game seeds. */
export function validateGameCatalog(
  puzzles: readonly GamePuzzle[],
  questSlugs?: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const puzzleIds = new Set<string>();
  for (const puzzle of puzzles) {
    if (puzzleIds.has(puzzle.id)) errors.push(`Duplicate puzzle id "${puzzle.id}".`);
    puzzleIds.add(puzzle.id);
    errors.push(...validateBase(puzzle, questSlugs));
    errors.push(
      ...(puzzle.kind === "connections"
        ? validateConnections(puzzle)
        : validateTimeline(puzzle)),
    );
  }
  if (!puzzles.some((puzzle) => puzzle.kind === "connections")) {
    errors.push("Catalog needs at least one Scripture Connections puzzle.");
  }
  if (!puzzles.some((puzzle) => puzzle.kind === "timeline")) {
    errors.push("Catalog needs at least one Bible Timeline puzzle.");
  }
  return errors;
}

/** Fails the build when reviewed game content no longer satisfies its contract. */
export function assertValidGameCatalog(
  puzzles: readonly GamePuzzle[],
  questSlugs?: ReadonlySet<string>,
): void {
  const errors = validateGameCatalog(puzzles, questSlugs);
  if (errors.length > 0) {
    throw new Error(`Invalid Scripture game catalog:\n- ${errors.join("\n- ")}`);
  }
}
