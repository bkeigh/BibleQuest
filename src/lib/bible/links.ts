/**
 * The single place a Bible chapter URL is built.
 *
 * Web keeps the readable nested route `/app/bible/john/3`: it is prerendered,
 * shareable, indexed, and already cached by the service worker.
 *
 * The static export bundled into the iOS app uses one flat reader route
 * instead. Prerendering the nested route there would mean emitting all 1189
 * chapter shells — measured against this repo's own build at roughly 48 KB of
 * HTML+RSC each, that is ~57 MB of near-identical app shell added to the
 * binary, against a 4.1 MB corpus. One shell plus a query is the same reader
 * for ~48 KB. If anyone proposes "just add generateStaticParams", check it
 * against that number first.
 */

export interface ChapterHrefOptions {
  /** Translation key, e.g. from `bibleTranslationKey`. */
  translation?: string;
  /** A single verse (`16`) or an inclusive range (`"3-20"`). */
  verse?: string | number;
  /** Scrolls to `#verse-N` on arrival. */
  anchor?: number;
}

import { isNativeTarget } from "@/lib/platform/target";

/** Only the native export ships the flat reader; web keeps the nested route. */
const usesFlatReaderRoute = isNativeTarget;

/**
 * The flat reader route.
 *
 * No trailing slash: the native export deliberately does NOT set
 * `trailingSlash`, because it makes `usePathname()` return `/app/quests/`,
 * which breaks every exact pathname comparison in the app — tab highlighting
 * in BottomNav, chrome hiding in AppShell, and the onboarding launch gate.
 */
export const FLAT_READER_PATH = "/app/bible/read";

export function chapterHref(
  bookSlug: string,
  chapter: number | string,
  options: ChapterHrefOptions = {},
): string {
  const { translation, verse, anchor } = options;

  const params: string[] = [];
  if (usesFlatReaderRoute()) {
    params.push(`book=${encodeURIComponent(bookSlug)}`);
    params.push(`chapter=${encodeURIComponent(String(chapter))}`);
  }
  if (translation) {
    params.push(`translation=${encodeURIComponent(translation)}`);
  }
  if (verse !== undefined && verse !== "") {
    params.push(`verse=${encodeURIComponent(String(verse))}`);
  }

  const base = usesFlatReaderRoute()
    ? FLAT_READER_PATH
    : `/app/bible/${bookSlug}/${chapter}`;
  const query = params.length ? `?${params.join("&")}` : "";
  const hash = anchor ? `#verse-${anchor}` : "";

  return `${base}${query}${hash}`;
}

/** The book chapter-picker route. Identical on both targets — it is a static page. */
export function bookHref(bookSlug: string): string {
  return `/app/bible/${bookSlug}`;
}
