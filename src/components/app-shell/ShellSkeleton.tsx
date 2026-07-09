/**
 * ShellSkeleton — the calm first-paint placeholder for app screens.
 *
 * Mirrors the PageHeader + PageContainer rhythm (heading line, subtitle line,
 * a stack of paper cards) so the swap to real content doesn't jump. Rendered
 * by ClientOnly while the persisted store hydrates and by the /app route-level
 * loading.tsx, so the first paint is never blank.
 *
 * The pulse is `motion-safe:` only, and both reduced-motion kill-switches
 * (the OS media query and html.force-reduce-motion in globals.css) freeze
 * all animation anyway — stillness is honored here too.
 */
export function ShellSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto w-full max-w-2xl px-5 pt-safe sm:px-8"
    >
      <div className="motion-safe:animate-pulse">
        {/* Header block — matches PageHeader's spacing */}
        <div className="pt-8 pb-2">
          <div className="h-8 w-40 rounded-md bg-linen" />
          <div className="mt-3 h-4 w-64 max-w-full rounded-md bg-linen/70" />
        </div>

        {/* Card blocks — matches the PaperCard stack every screen uses */}
        <div className="mt-6 space-y-4 pb-10">
          <div className="h-36 rounded-[var(--radius-card)] border border-mist/60 bg-paper/70" />
          <div className="h-24 rounded-[var(--radius-card)] border border-mist/60 bg-paper/70" />
          <div className="h-24 rounded-[var(--radius-card)] border border-mist/60 bg-paper/70" />
        </div>
      </div>
    </div>
  );
}
