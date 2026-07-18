import { notFound } from "next/navigation";
import { loadChapter } from "@/lib/bible/server";
import { getBookMeta } from "@/lib/bible/index";
import { ChapterReader } from "@/components/bible/ChapterReader";
import { bibleTranslationKey } from "@/lib/bible/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ book: string; chapter: string }>;
}) {
  const { book, chapter } = await params;
  const meta = getBookMeta(book);
  return { title: meta ? `${meta.name} ${chapter}` : "Bible" };
}

export default async function ChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ book: string; chapter: string }>;
  searchParams: Promise<{ translation?: string | string[] }>;
}) {
  const { book, chapter } = await params;
  const { translation } = await searchParams;
  const chapterNum = Number(chapter);
  if (!Number.isInteger(chapterNum)) notFound();

  const content = await loadChapter(book, chapterNum);
  if (!content) notFound();

  return (
    <ChapterReader
      key={`${book}:${chapterNum}`}
      content={content}
      translationOverride={bibleTranslationKey(
        typeof translation === "string" ? translation : undefined,
      )}
    />
  );
}
