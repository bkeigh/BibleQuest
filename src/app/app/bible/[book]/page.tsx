import Link from "next/link";
import { notFound } from "next/navigation";
import { bibleBooks, getBookMeta } from "@/lib/bible/index";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { IconArrowLeft } from "@/components/design-system/icons";

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
    <PageContainer className="pt-safe">
      <div className="pt-6">
        <Link
          href="/app/bible"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> Bible
        </Link>
      </div>

      <h1 className="mt-5 font-display text-[2rem] text-graphite">{meta.name}</h1>
      <p className="mt-1 text-[0.9375rem] text-ash capitalize">
        {meta.testament} Testament · {meta.chapterCount} chapters
      </p>

      <div className="mt-6 grid grid-cols-5 gap-2.5 pb-8 sm:grid-cols-6">
        {Array.from({ length: meta.chapterCount }, (_, i) => i + 1).map((c) => (
          <Link
            key={c}
            href={`/app/bible/${meta.slug}/${c}`}
            className="flex aspect-square items-center justify-center rounded-[10px] border border-mist bg-paper text-[1rem] text-charcoal transition-all duration-300 hover:border-olive-300 hover:bg-olive-50 hover:text-olive-700"
          >
            {c}
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
