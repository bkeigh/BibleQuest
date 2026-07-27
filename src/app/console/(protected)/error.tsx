"use client";

/** Contains operator query failures without leaking provider error details. */
export default function ConsoleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="console-panel console-error-panel" role="alert">
      <p className="console-eyebrow">BOUNDED FAILURE</p>
      <h1 className="mt-3 font-display text-[2rem] leading-tight text-graphite">
        Console data could not load.
      </h1>
      <p className="mt-3 max-w-xl text-small leading-relaxed text-ash">
        No operator action was taken. Try the read again; persistent failures
        should be checked against Supabase and Vercel health.
      </p>
      <button
        type="button"
        className="console-primary-button mt-6"
        onClick={reset}
      >
        Try again
      </button>
    </section>
  );
}
