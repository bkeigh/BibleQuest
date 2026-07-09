/**
 * PixelMascot — medium, hand-placed pixel companions.
 *
 * Bigger cousins of PixelIcon: one friendly sprite per onboarding /
 * sign-in page, always centered, always singular. Sacred exploration,
 * never arcade — same limited brand palette, one consistent outline.
 *
 * Rules (docs/PIXEL_SYSTEM.md): a mascot appears at most once per
 * screen, centered, at size 8-11. Never inline with body text.
 */
import { cn } from "@/lib/utils/cn";

const P: Record<string, string> = {
  k: "#1e3329", // outline — twilight deep green
  w: "#fffdf7", // warm white (wool, pages)
  W: "#efe4cf", // parchment shade
  f: "#8a6844", // face/limb brown
  F: "#6b4f34", // dark brown (soil, logs)
  g: "#d3a336", // brand gold
  G: "#b68b2f", // gold shade
  y: "#e7c563", // light gold (glow, flame highlight)
  o: "#e8913f", // flame orange
  e: "#0e533c", // brand evergreen
  E: "#2f7c58", // evergreen light
  l: "#6f8155", // olive leaf
  L: "#a8b98c", // olive light
  b: "#8fb9d4", // marian blue accent
  p: "#e5a8a1", // rose (cheeks)
  t: "#cfa878", // light tan (lamb muzzle)
};

const MASCOTS = {
  /** Welcome — a small lamb, glad you're here. */
  lamb: [
    "...kkkkkkkkk....",
    "..kwwwwwwwwwk...",
    ".kwwWwwwwwWwwk..",
    ".kwwwwwwwwwwwk..",
    ".kkwwwwwwwwwkk..",
    "kfkkffffffffkkfk",
    ".kkkffffffffkkk.",
    "...kfkffffkfk...",
    "...kfttttttfk...",
    "...kpttkkttpk...",
    "...kttttttttk...",
    "....kkkkkkkk....",
  ],
  /** Daily rhythm — a lantern for the path. */
  lantern: [
    "......kkkk......",
    "......k..k......",
    "....kkkkkkkk....",
    "...kggggggggk...",
    "...kg......gk...",
    "...kg..y...gk...",
    "...kg.yoy..gk...",
    "...kg.yoy..gk...",
    "...kg..o...gk...",
    "...kg......gk...",
    "...kggggggggk...",
    "....kkkkkkkk....",
    "......kGGk......",
    "......kkkk......",
  ],
  /** Scripture — an open scroll. */
  scroll: [
    ".kkkkkkkkkkkkkkkk.",
    "kgggggggggggggggGk",
    "kGgggggggggggggGGk",
    ".kkwwwwwwwwwwwwkk.",
    "..kwwwwwwwwwwwk...",
    "..kwweeeeewwwwk...",
    "..kwwwwwwwwwwwk...",
    "..kwweeeeeeewwk...",
    "..kwwwwwwwwwwwk...",
    "..kwweeeewwwwwk...",
    "..kwwwwwwwwwwwk...",
    ".kkwwwwwwwwwwwwkk.",
    "kgggggggggggggggGk",
    "kGgggggggggggggGGk",
    ".kkkkkkkkkkkkkkkk.",
  ],
  /** Prayer — a dove in flight. */
  dove: [
    ".........kk.......",
    "........kWWk......",
    ".......kWWWk......",
    "......kWWWWk......",
    "..kkk.kWWWWk......",
    ".kwkwkwWWWWwk.....",
    "kgkwwwwwwwwwwk....",
    ".kkwwwwwwwwwwkkk..",
    "...kwwwwwwwwwwwwk.",
    "...kwwwwwwwwkkk...",
    "....kwwwwwwk......",
    ".....kwwwk........",
    "......kkk.........",
  ],
  /** Growth — a two-leaf seedling. */
  sprout: [
    "...kk.....kk....",
    "..kLLk...kLLk...",
    ".kLlLLk.kLLlLk..",
    ".kLLLLklkLLLLk..",
    "..kLLk.l.kLLk...",
    "...kk.klk.kk....",
    "......klk.......",
    "......klk.......",
    "...kkkFlFkkk....",
    ".kkFFFFFFFFFkk..",
    ".kFFfFFFFfFFFk..",
    "..kkFFFFFFFkk...",
    "....kkkkkkk.....",
  ],
  /** Sign-in — a key: your journey, kept. */
  key: [
    "....kkkk........",
    "...kggggk.......",
    "..kg....gk......",
    "..kg.ee.gk......",
    "..kg.ee.gk......",
    "..kg....gk......",
    "...kggggk.......",
    "....kggk........",
    "....kggk........",
    "....kggk........",
    "....kggkgk......",
    "....kggkk.......",
    "....kggkgk......",
    ".....kkkk.......",
  ],
  /** Quests — a map with a trail to follow. */
  map: [
    ".kkkkkkkkkkkkkkkk.",
    "kwWwwwwwwwwwwwwWwk",
    "kwwwwwwwwwwwe.ewwk",
    "kwwwwwwwwwwwwewwwk",
    "kwwwwwwwwwgwe.ewwk",
    "kwwwwwwwwwwwwwwwwk",
    "kwwwwwwwgwwwwwwwwk",
    "kwwwwwgwwwwwwwwwwk",
    "kwwwgwwwwwwwwwwwwk",
    "kwegwwwwwwwwwwwwwk",
    "kwWwwwwwwwwwwwwWwk",
    ".kkkkkkkkkkkkkkkk.",
  ],
  /** Reflection — a campfire to rest beside. */
  campfire: [
    "................",
    ".......y........",
    "......yoy.......",
    ".....yooy.......",
    ".....yogoy......",
    "....yogggoy.....",
    "....yoggoy......",
    ".....yooy.......",
    "..kFFkkkkFFk....",
    ".kFfFFFFFFfFk...",
    "..kkFFFFFFkk....",
    "....kkkkkk......",
  ],
} satisfies Record<string, string[]>;

export type PixelMascotName = keyof typeof MASCOTS;

export const PIXEL_MASCOT_NAMES = Object.keys(MASCOTS) as PixelMascotName[];

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
  const rows = MASCOTS[name];
  const cols = Math.max(...rows.map((r) => r.length));

  return (
    <svg
      width={cols * size}
      height={rows.length * size}
      viewBox={`0 0 ${cols} ${rows.length}`}
      className={cn("pixelated mx-auto block shrink-0", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) => {
          const fill = P[ch];
          if (!fill) return null;
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
