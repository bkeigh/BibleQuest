/** Calm orientation for a guide or pilgrimage; never presented as a score. */
export function GuidedProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const bounded = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[0.75rem] text-ash">
        <span>{label}</span>
        <span aria-hidden="true">{bounded}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={bounded}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist"
      >
        <div
          className="h-full rounded-full bg-olive-500 transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
}
