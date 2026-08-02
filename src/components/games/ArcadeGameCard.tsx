import Image from "next/image";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";

/** The scenes the arcade draws its cards on, shared by Home and the arcade. */
export const ARCADE_ART = {
  today: "/art/scripture-games-today.webp",
  sevenDays: "/art/scripture-games-coming-1.webp",
  archive: "/art/scripture-games-coming-2.webp",
} as const;

/**
 * One arcade game, laid over a scene.
 *
 * Lifted out of the Home rail so the arcade page and Home draw the same card
 * rather than two that drift apart. The identity pins to the top-left and the
 * details settle at the bottom, which keeps a row of cards scannable when they
 * sit side by side at different heights.
 */
export function ArcadeGameCard({
  image,
  eyebrow,
  title,
  description,
  icon,
  footer,
  muted = false,
  className,
}: {
  image: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: Parameters<typeof PixelIcon>[0]["name"];
  footer?: React.ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <PaperCard
      interactive={!muted}
      variant="paper"
      padding="none"
      className={`relative isolate flex h-full min-h-[17rem] overflow-hidden ${className ?? ""}`}
    >
      <Image
        src={image}
        alt=""
        fill
        sizes="(max-width: 640px) 86vw, 34rem"
        className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#071813]/95 via-[#102b22]/70 to-black/10"
      />
      {muted && (
        <span aria-hidden="true" className="absolute inset-0 bg-graphite/15" />
      )}
      {/* Keeps the identity pinned to the top-left while the game details settle at the bottom. */}
      <div className="relative z-10 flex h-full min-h-[17rem] w-full flex-col p-5 text-white sm:p-6">
        <div className="flex items-center gap-3">
          {/* A 40px glass chip was clipping a 56px sprite, and its
              `backdrop-blur` bought a compositing layer per card. A drop
              shadow does the separating instead, which is what the art
              needs over a photograph anyway.

              Different games use different sprites, and the weight correction
              draws thin art larger without letting it take more room — so the
              eyebrow sits in the same place whichever game this is. */}
          <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <PixelIcon
              name={icon}
              size={72}
              // See SupportLink: the reset would cap this at the anchor's width.
              className="absolute max-w-none [filter:drop-shadow(0_2px_5px_rgb(0_0_0/0.45))]"
            />
          </span>
          <p className="text-caption font-medium uppercase tracking-[0.12em] text-white/80">
            {eyebrow}
          </p>
        </div>
        <div className="mt-auto pt-8">
          {/* Every other card title in the app uses the display face; pixel is
              reserved for small labels and badges at 0.875rem. A 2rem pixel
              title also wrapped long game names across two hard-to-read lines
              and competed with the pixel section heading directly above it. */}
          <h3 className="max-w-[20ch] font-display text-[1.75rem] leading-tight text-white min-[390px]:text-[1.875rem]">
            {title}
          </h3>
          <p className="mt-2 max-w-[42ch] text-small leading-relaxed text-white/80">
            {description}
          </p>
          {footer && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-caption text-white/75">
              {footer}
            </div>
          )}
        </div>
      </div>
    </PaperCard>
  );
}
