/**
 * Calm skeleton for chapter navigation — chapter text loads on the server,
 * so this gives immediate feedback instead of a frozen tap.
 */
export default function ChapterLoading() {
  return (
    <div
      className="mx-auto w-full max-w-2xl px-5 pt-safe sm:px-8"
      aria-busy="true"
      aria-label="Loading chapter"
    >
      <div className="flex items-center justify-between pt-6">
        <div className="h-4 w-20 animate-pulse rounded bg-linen" />
        <div className="h-3 w-28 animate-pulse rounded bg-linen" />
      </div>

      <div className="mt-6 h-8 w-44 animate-pulse rounded bg-linen" />

      <div className="measure-reading mt-7 space-y-3.5">
        {[100, 92, 97, 88, 95, 90, 96, 84, 93, 78].map((w, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-linen"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}
