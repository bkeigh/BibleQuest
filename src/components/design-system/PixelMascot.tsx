/**
 * PixelMascot — medium, hand-placed pixel companions.
 *
 * Bigger cousins of PixelIcon, resolved from the same pixel-asset
 * registry (pixel-assets.ts): grid assets render as SVG <rect>s, png
 * assets as a plain pixelated <img>. One friendly sprite per
 * onboarding / sign-in page, always centered, always singular. Sacred
 * exploration, never arcade — same limited brand palette, one
 * consistent outline.
 *
 * Rules (docs/PIXEL_SYSTEM.md): a mascot appears at most once per
 * screen, centered, at size 8-11. Never inline with body text.
 */
import { cn } from "@/lib/utils/cn";
import { PIXEL_MASCOTS, type PixelMascotName } from "./pixel-assets";

export { PIXEL_MASCOT_NAMES } from "./pixel-assets";
export type { PixelMascotName } from "./pixel-assets";

interface PixelMascotProps {
  name: PixelMascotName;
  /** Rendered size of each pixel cell. 8-11 ≈ medium (128-190px wide). */
  size?: number;
  className?: string;
  /** Accessible label. Mascots are decorative by default. */
  title?: string;
}

export function PixelMascot({
  name,
  size = 9,
  className,
  title,
}: PixelMascotProps) {
  const asset = PIXEL_MASCOTS[name];
  if (!asset) return null;

  if (asset.kind === "png") {
    const cell = Math.max(1, Math.round(size * (asset.cellScale ?? 1)));
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny local pixel art; next/image would blur and lazy-load it
      <img
        src={asset.src}
        width={asset.cols * cell}
        height={asset.rows * cell}
        alt={title ?? ""}
        role={title ? "img" : "presentation"}
        aria-hidden={title ? undefined : true}
        className={cn("pixelated mx-auto block shrink-0", className)}
      />
    );
  }

  const rows = asset.rows;
  const cols = Math.max(...rows.map((r) => r.length));
  const cell = Math.max(1, Math.round(size * (asset.cellScale ?? 1)));

  return (
    <svg
      width={cols * cell}
      height={rows.length * cell}
      viewBox={`0 0 ${cols} ${rows.length}`}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
      className={cn("pixelated mx-auto block shrink-0", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) => {
          const fill = asset.palette[ch];
          if (!fill || fill === "transparent") return null;
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1.02}
              height={1.02}
              fill={fill}
            />
          );
        })
      )}
    </svg>
  );
}
