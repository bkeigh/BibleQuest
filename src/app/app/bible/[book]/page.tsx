import { notFound } from "next/navigation";
import { bibleBooks, getBookMeta } from "@/lib/bible/index";
import { BookChapterPicker } from "@/components/bible/BookChapterPicker";

export function generateStaticParams() {
  return bibleBooks.map((b) => ({ book: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book } = await params;
  return { title: getBookMeta(book)?.name ?? "Bible" };
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book } = await params;
  const meta = getBookMeta(book);
  if (!meta) notFound();

  return (
    <BookChapterPicker
      book={{
        slug: meta.slug,
        name: meta.name,
        testament: meta.testament,
        chapterCount: meta.chapterCount,
      }}
    />
  );
}
