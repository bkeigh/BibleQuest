/**
 * ArtMascot renders one large, still 2.5D companion for feature moments.
 */
import { cn } from "@/lib/utils/cn";
import { ART_MASCOTS, type ArtMascotName } from "./art-assets";

export type { ArtMascotName } from "./art-assets";

interface ArtMascotProps {
  name: ArtMascotName;
  size?: number;
  className?: string;
  title?: string;
  priority?: boolean;
}

export function ArtMascot({
  name,
  size = 192,
  className,
  title,
  priority = false,
}: ArtMascotProps) {
  const asset = ART_MASCOTS[name];
  if (!asset) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local transparent art is already optimized for its exact use
    <img
      src={asset.src}
      width={asset.nativeWidth}
      height={asset.nativeHeight}
      style={{ width: Math.round(size), height: Math.round(size) }}
      alt={title ?? ""}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      draggable={false}
      decoding="async"
      loading={priority ? "eager" : undefined}
      fetchPriority={priority ? "high" : undefined}
      data-art-mascot={name}
      className={cn(
        "artwork-2-5d artwork-2-5d-feature mx-auto block shrink-0 object-contain",
        className,
      )}
    />
  );
}
