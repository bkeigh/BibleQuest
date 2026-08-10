"use client";

/**
 * SeasonalAtmosphere — very soft ambient background particles that drift
 * with the season. Optional, decorative, reduced-motion aware (the CSS
 * disables all `.ambient` animation under prefers-reduced-motion).
 */
import { useMemo } from "react";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { hashString, seededRandom } from "@/lib/utils/dates";
import { useCurrentDayKey } from "@/lib/use-current-day-key";

type ParticleKind = "leaf" | "star" | "petal" | "snow" | "ember" | "dust";

const SEASON_PARTICLE: Record<string, ParticleKind> = {
  ordinary_time: "leaf",
  advent: "star",
  christmas: "snow",
  lent: "dust",
  holy_week: "dust",
  easter: "petal",
  pentecost: "ember",
};

const COLORS: Record<ParticleKind, string> = {
  leaf: "var(--color-olive-300)",
  star: "var(--color-gold-300)",
  petal: "var(--color-rose-300)",
  /* moon-paper stays warm-white in both themes — paper flips dark in candle
     mode and would make snow vanish. */
  snow: "var(--color-moon-paper)",
  ember: "var(--color-gold-300)",
  dust: "var(--color-fog)",
};

export function SeasonalAtmosphere({
  density = 10,
  className,
}: {
  density?: number;
  className?: string;
}) {
  const dayKey = useCurrentDayKey();
  const season = getCurrentSeason();
  const kind = SEASON_PARTICLE[season.key] ?? "leaf";

  // Deterministic per-day layout so it doesn't reshuffle on every render.
  // Each particle gets a STATIC resting position and only breathes gently
  // around it (ambient-float). This is deliberate: the old full-height fall
  // relied on the animation for vertical spread, so reduced-motion froze
  // every particle into a hard row of dots along the container's top edge.
  // Now, with animation off, the scatter simply holds still — intentional
  // in both modes.
  const particles = useMemo(() => {
    const rand = seededRandom(hashString(`${dayKey}:${kind}`));
    return Array.from({ length: density }, (_, i) => ({
      left: 3 + rand() * 94,
      top: 6 + rand() * 82,
      size: 2.5 + rand() * 3.5,
      duration: 10 + rand() * 10,
      delay: -rand() * 12,
      drift: (rand() - 0.5) * 18,
      opacity: 0.14 + rand() * 0.22,
      key: i,
    }));
  }, [dayKey, kind, density]);

  return (
    <div
      className={`ambient pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
      aria-hidden="true"
    >
      {particles.map((p) => (
        <span
          key={p.key}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            backgroundColor: COLORS[kind],
            opacity: p.opacity,
            ["--drift" as string]: `${p.drift}px`,
            animation: `ambient-float ${p.duration}s ease-in-out ${p.delay}s infinite`,
            filter: kind === "snow" ? "blur(0.3px)" : undefined,
          }}
        />
      ))}
    </div>
  );
}
