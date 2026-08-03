"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
} from "@/components/design-system/icons";
import { useToast } from "@/components/design-system/Toast";
import { PlusFeatureDialog } from "@/components/plus/PlusFeatureDialog";
import { usePlus } from "@/lib/billing/usePlus";
import {
  WALLPAPER_CATALOG,
  canAccessWallpaper,
  getWallpaperById,
  type WallpaperId,
} from "@/lib/wallpapers/catalog";
import { cn } from "@/lib/utils/cn";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";

type WallpaperChoice = WallpaperId | "none";

interface WallpaperPickerProps {
  value: WallpaperChoice;
  onChange: (value: WallpaperChoice) => void;
}

/** Horizontal, keyboard-navigable artwork selector with clear tier gating. */
export function WallpaperPicker({ value, onChange }: WallpaperPickerProps) {
  const { toast } = useToast();
  const { isPlus, loading } = usePlus();
  const shouldReduceMotion = useShouldReduceMotion();
  const [lockedWallpaperTitle, setLockedWallpaperTitle] = useState<
    string | null
  >(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const choices = ["none", ...WALLPAPER_CATALOG.map(({ id }) => id)] as const;
  const requestedWallpaper = value === "none" ? undefined : getWallpaperById(value);
  const savedChoiceLocked = Boolean(
    !loading &&
      requestedWallpaper &&
      !canAccessWallpaper(requestedWallpaper, isPlus)
  );
  const effectiveValue = savedChoiceLocked ? "none" : value;
  const selectedIndex = Math.max(0, choices.indexOf(effectiveValue));

  function explainLockedWallpaper(title: string) {
    if (loading) {
      toast("Checking your Plus access…");
      return;
    }
    setLockedWallpaperTitle(title);
  }

  // Gives mouse users an explicit way to page through the horizontal gallery.
  function scrollWallpapers(direction: -1 | 1) {
    const gallery = scrollRef.current;
    if (!gallery) return;
    gallery.scrollBy({
      left: direction * Math.max(320, gallery.clientWidth * 0.8),
      behavior: shouldReduceMotion ? "auto" : "smooth",
    });
  }

  // Arrow keys preserve the familiar radio-group interaction while the cards
  // remain horizontally scrollable by touch.
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % choices.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + choices.length) % choices.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = choices.length - 1;
    }

    if (next === null) return;
    event.preventDefault();
    const choice = choices[next];
    const wallpaper = getWallpaperById(choice);
    if (choice === "none") {
      onChange(choice);
    } else if (wallpaper && canAccessWallpaper(wallpaper, isPlus)) {
      onChange(wallpaper.id);
    } else if (wallpaper) {
      explainLockedWallpaper(wallpaper.title);
    }
    refs.current[next]?.focus();
    refs.current[next]?.scrollIntoView({
      behavior: shouldReduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }

  return (
    <fieldset className="min-w-0 max-w-full pb-4 pt-5">
      <legend className="sr-only">Wallpaper</legend>
      <div className="flex items-center justify-between gap-4">
        <p aria-hidden="true" className="text-[0.9375rem] text-charcoal">
          Wallpaper
        </p>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <button
            type="button"
            aria-label="Show previous wallpapers"
            onClick={() => scrollWallpapers(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-mist text-accent transition-colors hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconArrowLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Show next wallpapers"
            onClick={() => scrollWallpapers(1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-mist text-accent transition-colors hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconArrowRight size={18} />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-caption leading-relaxed text-ash">
        Every artwork scene is included with Plus. Parchment remains available
        to everyone.
      </p>

      <div
        ref={scrollRef}
        role="radiogroup"
        aria-label="Choose a wallpaper"
        className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          ref={(element) => {
            refs.current[0] = element;
          }}
          type="button"
          role="radio"
          aria-checked={effectiveValue === "none"}
          tabIndex={selectedIndex === 0 ? 0 : -1}
          onKeyDown={(event) => onKeyDown(event, 0)}
          onClick={() => onChange("none")}
          className={cn(
            "group w-28 shrink-0 snap-center text-left",
            "rounded-[var(--radius-card)] focus-visible:outline-offset-2",
          )}
        >
          <span
            className={cn(
              "relative block aspect-[9/16] overflow-hidden rounded-[var(--radius-card)] border bg-[linear-gradient(145deg,var(--color-paper),var(--color-linen))] paper-shadow",
              effectiveValue === "none"
                ? "border-accent ring-2 ring-accent/25"
                : "border-mist",
            )}
          >
            <span className="absolute inset-3 rounded-[10px] border border-mist bg-paper/80" />
            <span className="absolute inset-x-3 bottom-4 text-center font-art-label text-[0.75rem] uppercase tracking-[0.08em] text-accent">
              Classic
            </span>
            {effectiveValue === "none" && <SelectedMark />}
          </span>
          <span className="mt-1.5 block truncate text-caption text-charcoal">
            Parchment
          </span>
        </button>

        {WALLPAPER_CATALOG.map((wallpaper, index) => {
          const selected = effectiveValue === wallpaper.id;
          const accessible = canAccessWallpaper(wallpaper, isPlus);
          const refIndex = index + 1;
          return (
            <button
              key={wallpaper.id}
              ref={(element) => {
                refs.current[refIndex] = element;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-haspopup={!accessible ? "dialog" : undefined}
              aria-label={`${wallpaper.title}, Plus${!accessible ? ", locked" : ""}`}
              tabIndex={selectedIndex === refIndex ? 0 : -1}
              onKeyDown={(event) => onKeyDown(event, refIndex)}
              onClick={() => {
                if (accessible) onChange(wallpaper.id);
                else explainLockedWallpaper(wallpaper.title);
              }}
              className="group w-28 shrink-0 snap-center text-left rounded-[var(--radius-card)] focus-visible:outline-offset-2"
            >
              <span
                className={cn(
                  "relative block aspect-[9/16] overflow-hidden rounded-[var(--radius-card)] border bg-linen paper-shadow",
                  selected ? "border-accent ring-2 ring-accent/25" : "border-mist",
                )}
              >
                <Image
                  src={wallpaper.thumbnailUrl}
                  alt=""
                  fill
                  sizes="112px"
                  loading={index < 6 ? "eager" : "lazy"}
                  className={cn(
                    "object-cover transition-transform duration-300",
                    accessible && !shouldReduceMotion
                      ? "group-hover:scale-[1.025]"
                      : !accessible
                        ? "scale-[1.02] grayscale-[20%]"
                        : "",
                  )}
                />
                {!accessible && (
                  <span className="absolute inset-0 flex items-center justify-center bg-dusk/35">
                    <span className="rounded-full border border-white/45 bg-dusk/75 px-2 py-1 text-[0.625rem] font-medium uppercase tracking-[0.12em] text-white">
                      {loading ? "Checking" : "Plus"}
                    </span>
                  </span>
                )}
                {selected && <SelectedMark />}
              </span>
              <span className="mt-1.5 block truncate text-caption text-charcoal">
                {wallpaper.title}
              </span>
              <span className="block text-[0.6875rem] uppercase tracking-[0.08em] text-ash">
                Plus
              </span>
            </button>
          );
        })}
      </div>

      {savedChoiceLocked && requestedWallpaper && (
        <p role="status" className="mt-2 text-caption leading-relaxed text-ash">
          {requestedWallpaper.title} is saved for Plus. Parchment is showing
          for now.
        </p>
      )}
      <PlusFeatureDialog
        open={lockedWallpaperTitle !== null}
        onClose={() => setLockedWallpaperTitle(null)}
        title={
          lockedWallpaperTitle
            ? `Make ${lockedWallpaperTitle} your wallpaper`
            : "Choose a Plus wallpaper"
        }
        description="Every still and live wallpaper is included with BibleQuest Plus. Parchment remains available without a membership."
      />
    </fieldset>
  );
}

/** Compact selected-state badge that stays legible on bright and dark art. */
function SelectedMark() {
  return (
    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-paper shadow-md">
      <IconCheck size={15} strokeWidth={2.2} />
    </span>
  );
}
