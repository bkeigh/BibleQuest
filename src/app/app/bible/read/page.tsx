/**
 * The flat chapter reader used by the native (static export) build.
 *
 * On web this route also exists and works, but nothing links to it —
 * `chapterHref` only emits it when NEXT_PUBLIC_APP_PLATFORM is "native", so
 * the readable nested route stays canonical for sharing and indexing.
 *
 * `useSearchParams` in the child requires a Suspense boundary: under
 * `output: "export"` it yields nothing during prerender and populates on the
 * client. Same pattern as `app/prayer/new`.
 */
import { Suspense } from "react";
import { ChapterReaderRoute } from "@/components/bible/ChapterReaderRoute";
import { ChapterSkeleton } from "@/components/bible/ChapterSkeleton";

export const metadata = { title: "Bible" };

export default function ChapterReadPage() {
  return (
    <Suspense fallback={<ChapterSkeleton />}>
      <ChapterReaderRoute />
    </Suspense>
  );
}
