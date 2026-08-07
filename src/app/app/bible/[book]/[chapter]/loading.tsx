/**
 * Chapter navigation feedback. On web the chapter text is read on the server,
 * so this fires between the tap and the rendered page instead of a frozen tap.
 */
import { ChapterSkeleton } from "@/components/bible/ChapterSkeleton";

export default function ChapterLoading() {
  return <ChapterSkeleton />;
}
