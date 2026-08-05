/**
 * Calm placeholder while a chapter's text is being fetched.
 *
 * Shared by the route-level `loading.tsx` on web and by the native reader,
 * which resolves its chapter from a lazily imported book chunk on the client.
 * Keeping one component means the two paths cannot drift into different
 * loading shapes.
 */
export function ChapterSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-2xl px-5 pt-safe sm:px-8"
      aria-busy="true"
      aria-label="Loading chapter"
    >
      <div className="flex items-center justify-between pt-6">
        <div className="h-4 w-20 motion-safe:animate-pulse rounded bg-linen" />
        <div className="h-3 w-28 motion-safe:animate-pulse rounded bg-linen" />
      </div>

      <div className="mt-6 h-8 w-44 motion-safe:animate-pulse rounded bg-linen" />

      <div className="measure-reading mt-7 space-y-3.5">
        {[100, 92, 97, 88, 95, 90, 96, 84, 93, 78].map((w, i) => (
          <div
            key={i}
            className="h-4 motion-safe:animate-pulse rounded bg-linen"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}
