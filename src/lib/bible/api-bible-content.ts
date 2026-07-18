/** Minimal API.Bible JSON content node used by chapter/passage parsing. */
export interface ApiBibleNode {
  name?: string;
  type?: string;
  text?: string;
  attrs?: {
    number?: string;
    sid?: string;
    verseId?: string;
    verseOrgIds?: string[];
  };
  items?: ApiBibleNode[];
}

/**
 * Extract canonical verse numbers from API.Bible/USFM identifiers.
 *
 * Besides ordinary `JHN.3.16`, the provider documents suffixes and grouped
 * spans such as `MAT.1.2-MAT.1.6a`. Expanding the numeric span lets a request
 * for any member display the complete provider-supplied group rather than
 * treating it as missing content.
 */
function verseNumbers(value: string | undefined): number[] {
  if (!value) return [];
  const parts = value.trim().split("-");
  const endpoints = parts
    .map((part) => /(\d+)[a-z]?$/i.exec(part.trim()))
    .map((match) => (match ? Number(match[1]) : Number.NaN))
    .filter((number) => Number.isInteger(number) && number > 0);
  if (!endpoints.length) return [];

  const start = endpoints[0];
  const end = endpoints.at(-1) ?? start;
  // A grouped span is chapter-local in chapter/passage content. Stay bounded
  // by API.Bible's documented maximum of fewer than 500 consecutive verses;
  // malformed or cross-chapter descending identifiers fall back to endpoints.
  if (end >= start && end - start < 500) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  return [...new Set(endpoints)];
}

function nodeVerseNumbers(node: ApiBibleNode): number[] {
  const ids = [
    ...(node.attrs?.verseOrgIds ?? []),
    node.attrs?.verseId,
    node.attrs?.sid,
    node.name === "verse" ? node.attrs?.number : undefined,
  ];
  return [...new Set(ids.flatMap(verseNumbers))];
}

function cleanProviderText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Groups the provider's nested JSON text nodes by their explicit verse ids.
 * Headings without verse metadata are intentionally ignored.
 */
export function parseApiBibleContent(nodes: ApiBibleNode[]): Map<number, string> {
  const passages = new Map<number, string[]>();

  function walk(items: ApiBibleNode[], inherited: number[] = []) {
    let active = inherited;
    for (const node of items) {
      const explicit = nodeVerseNumbers(node);
      if (node.name === "verse") {
        if (explicit.length) active = explicit;
        // The marker's child text is the printed verse number, not Scripture.
        continue;
      }
      const verseNumbers = explicit.length ? explicit : active;
      if (node.type === "text" && node.text && verseNumbers.length) {
        for (const number of verseNumbers) {
          const current = passages.get(number) ?? [];
          current.push(node.text);
          passages.set(number, current);
        }
      }
      if (node.items?.length) walk(node.items, verseNumbers);
    }
  }

  walk(nodes);
  return new Map(
    [...passages.entries()]
      .map(([number, pieces]) => [number, cleanProviderText(pieces.join(" "))] as const)
      .filter(([, text]) => Boolean(text)),
  );
}

/**
 * Assemble a requested canonical range without repeating provider text shared
 * by a grouped verse span.
 */
export function joinApiBibleVerseRange(
  verses: Map<number, string>,
  start: number,
  end: number,
): string {
  const pieces: string[] = [];
  for (let verse = start; verse <= end; verse += 1) {
    const text = verses.get(verse)?.trim();
    if (text && text !== pieces.at(-1)) pieces.push(text);
  }
  return cleanProviderText(pieces.join(" "));
}
