/**
 * PixelMascot — medium, hand-placed pixel companions.
 *
 * Bigger cousins of PixelIcon, resolved from the same production PNG registry.
 * Native source canvases stay separate from rendered layout. One friendly
 * sprite appears per onboarding or sign-in page, always centered and singular.
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
  /** Optional screen-specific animation that preserves the mascot's layout. */
  src?: string;
  /** Rendered edge in CSS pixels, same units as `PixelIcon`. */
  size?: number;
  className?: string;
  /** Accessible label. Mascots are decorative by default. */
  title?: string;
}

export function PixelMascot({
  name,
  src,
  size = 192,
  className,
  title,
}: PixelMascotProps) {
  const asset = PIXEL_MASCOTS[name];
  if (!asset) return null;

  const renderedWidth = Math.round(size);
  const renderedHeight = Math.round(size * (asset.rows / asset.cols));

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local pixel art must stay crisp and load without image optimization
    <img
      src={src ?? asset.src}
      width={asset.nativeWidth}
      height={asset.nativeHeight}
      style={{ width: renderedWidth, height: renderedHeight }}
      alt={title ?? ""}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      draggable={false}
      decoding="async"
      className={cn("pixelated mx-auto block shrink-0 object-contain", className)}
    />
  );
}
