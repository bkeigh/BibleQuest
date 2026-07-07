"use client";

/**
 * SeasonalAtmosphere — very soft ambient background particles that drift
 * with the season. Optional, decorative, reduced-motion aware (the CSS
 * disables all `.ambient` animation under prefers-reduced-motion).
 */
import { useMemo } from "react";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { hashString, seededRandom, toDateKey } from "@/lib/utils/dates";

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
  snow: "#ffffff",
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
  const season = getCurrentSeason();
  const kind = SEASON_PARTICLE[season.key] ?? "leaf";

  // Deterministic per-day layout so it doesn't reshuffle on every render.
  const particles = useMemo(() => {
    const rand = seededRandom(hashString(`${toDateKey()}:${kind}`));
    return Array.from({ length: density }, (_, i) => ({
      left: rand() * 100,
      size: 3 + rand() * 4,
      duration: 16 + rand() * 16,
      delay: -rand() * 24,
      drift: (rand() - 0.5) * 24,
      opacity: 0.25 + rand() * 0.35,
      key: i,
    }));
  }, [kind, density]);

  return (
    <div
      className={`ambient pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
      aria-hidden="true"
    >
      {particles.map((p) => (
        <span
          key={p.key}
          className="absolute top-0 rounded-full"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: COLORS[kind],
            opacity: p.opacity,
            ["--drift" as string]: `${p.drift}px`,
            animation: `drift ${p.duration}s linear ${p.delay}s infinite`,
            filter: kind === "snow" ? "blur(0.3px)" : undefined,
          }}
        />
      ))}
    </div>
  );
}
