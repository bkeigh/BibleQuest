/** Keeps navigation stable while a fresh server-side operator query resolves. */
export default function ConsoleLoading() {
  return (
    <div className="console-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading console data</span>
      <div className="console-skeleton console-skeleton-kicker" />
      <div className="console-skeleton console-skeleton-title" />
      <div className="console-skeleton console-skeleton-copy" />
      <div className="console-loading-grid">
        <div className="console-skeleton console-skeleton-card" />
        <div className="console-skeleton console-skeleton-card" />
        <div className="console-skeleton console-skeleton-card" />
      </div>
      <div className="console-skeleton console-skeleton-panel" />
    </div>
  );
}
