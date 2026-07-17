# BibleQuest Pixel System

Sacred exploration, never retro-arcade. Pixel art is BibleQuest's signature
accent — a storybook voice for quest, growth, and celebration moments. It is
rationed on purpose: when everything is pixelated, nothing is special.

## The three instruments

| Instrument | Component / utility | Scale | Use |
|---|---|---|---|
| Small sprites | `PixelIcon` (`design-system/PixelIcon.tsx`) | True 32×32 authored canvas, normally shown at 1× / 32px | Quest category glyphs, milestone marks, tiny decorations |
| Feature sprites | `PixelIcon` (same component) | 16×18 candles; true 32×32 tree stages | The streak candle set, the journey tree stages |
| Mascots | `PixelMascot` (`design-system/PixelMascot.tsx`) | 16–20 cell canvases, 4–7px rendered cells | One per onboarding / sign-in page, big empty states |

Plus the accent font: `font-pixel` utility (Ithaca, SIL OFL), 14px minimum —
short labels only (badges, quest tags, tiny decorative headings). And two
surface utilities: `pixel-frame` / `pixel-frame-gold` (chunky 2px border +
hard offset shadow) for achievement-style cards only.

## The asset registry (`design-system/pixel-assets.ts`)

Every sprite and mascot lives in one registry file. Components are thin
resolvers: consumers reference assets by name and never know how the art is
stored. Production art is generated deterministically from integer-aligned
rectangles, ellipses, and lines into transparent character grids. Legacy icon
recipes are doubled onto the shared 32×32 grid before rasterisation; key
silhouettes use direct 32×32 recipes for one-pixel details and negative space.
This avoids background-removal halos, antialiasing artifacts, and inconsistent
generated pixel sizes. The registry still accepts a PNG for a deliberately
hand-drawn replacement:

```ts
{ kind: "grid", rows, palette, ambient? }         // hand-placed characters
{ kind: "png", src, cols, rows, ambientClassName? } // pre-drawn file
```

- `PIXEL_SPRITES` feeds `PixelIcon`; `PIXEL_MASCOTS` feeds `PixelMascot`.
- The `size` prop always means **px per cell**. A png entry declares its
  logical grid (`cols`/`rows`), so rendered dimensions are identical to the
  grid it replaces — no call site ever changes.
- `cellScale` preserves historic component sizing while snapping every final
  cell to a whole CSS pixel. Small icons normally resolve to exactly 32×32.
- Palette colors come only from the named constants at the top of the file:
  live-token dark outline (`#1e3329`), evergreen (`#0e533c`), olive, brand
  gold (`#d3a336`), leather, parchment, charcoal, and restrained prayer blue,
  rose, stone, skin, and flame ramps. Lighter and darker material ramps are
  intentional pixel-art shades of those live brand anchors.

### Replacing a grid with a PNG (PixelLab workflow)

1. Export the art with a transparent background, sized at an **integer
   multiple** of the logical grid (e.g. the 10×14 candle at 4× = 40×56px).
   Fractional scaling smears; the file's pixel grid must map to whole cells.
2. Drop it in `public/pixel/` named after the registry key:
   `public/pixel/<name>.png` for sprites, `public/pixel/mascot-<name>.png`
   for mascots (e.g. `candle-halo.png`, `tree-stage-4.png`,
   `mascot-lamb.png`).
3. Flip the registry entry, keeping the logical grid dims:
   `{ kind: "png", src: "/pixel/candle-halo.png", cols: 10, rows: 14 }`.
4. If the grid had `ambient` per-cell motion, set `ambientClassName` to a
   whole-image fallback (e.g. `"[animation:var(--animate-flicker)]"`), or
   leave it off for stillness. PNGs cannot flicker a single flame cell —
   for living details, grids remain the better medium.

Nothing else changes: names, sizes, a11y semantics, and every importing
file stay untouched.

## Grid & stroke rules

- Every sprite lives on a whole-cell grid rendered as SVG `<rect>`s with
  `image-rendering: pixelated` (`pixelated` utility). Never scale to
  fractional cell sizes; never blur, never rotate.
- Every silhouette carries a single dark-green outline. Small icons keep it
  sparse; mascots and feature sprites use it continuously so they remain
  recognizable on parchment, linen, and candle-mode surfaces.
- Light comes from the **upper left**: highlights top-left, shade
  lower-right, 2–3 shade levels per material, minimal dithering.
- Small sprites: max ~6 colors. Feature sprites may use up to ~10 (outline,
  three canopy greens, two trunk browns, fruit gold pair, rose pair) —
  always drawn from the shared palette constants: twilight outline, warm
  white/parchment, brand evergreen `#0e533c`, brand gold `#d3a336` + light
  gold, olive pair, flame orange, face brown/tan, rose, marian blue.

## Current inventory

- **Small sprites (30)**: candle, leaf, star, bird, flower, chapel, closed
  book, open book, bookmark, lantern, path, tree, sun, heart, hands, praying
  hands, wheat, dove, cross, door, key, scroll, compass, crown, mountain,
  moon, service basket, forgiveness links, community people, and fountain.
- **Streak candles (5, 16×18)**: `candle-unlit` → `candle-small` →
  `candle-steady` → `candle-sparks` → `candle-halo`. One shared body; only
  the flame and blessing details grow (see `candleStage` in
  `lib/questos/streak-engine.ts`). Flame cells flicker via `ambient`.
- **Journey tree stages (6, true 32×32)**: `tree-stage-0` (two-leaf seedling) →
  `tree-stage-1` (open sapling) → `tree-stage-2` (young branched tree) →
  `tree-stage-3` (growing clustered canopy) → `tree-stage-4` (fruit-bearing) →
  `tree-stage-5` (broad sheltering crown + small flowers). Every stage shares
  one trunk fork, soil, light direction, outline, and canopy ramp. Canopy lobes
  keep visible seams so mature trees read as foliage rather than a green blob.
- **Mascots (8, 16–20 cells)**: lamb, lantern, scroll, dove, sprout, key,
  map, campfire.

## Where pixel art is allowed

- Quest UI: category glyphs, picked/completed marks, the quests empty state
- Achievement/milestone cards and reveals (with `pixel-frame-gold`)
- Onboarding + sign-in: exactly **one mascot per page, centered, medium**
- Empty states (one small sprite or one mascot, never both)
- Growth/journey celebration moments (`pixelSparkle` preset, ambient only)
- The streak candle and the journey tree (feature sprites, one per screen)

## Where it is NOT allowed

- Navigation, tab bars, form controls, toasts' close buttons → vector
  icons (`design-system/icons.tsx`) stay clean
- Scripture surfaces: verse text, chapter reader, verse cards
- Body text of any kind; running paragraphs never set in `font-pixel`
- More than one mascot per screen; more than ~3 sprites in one viewport

## The accent font (Ithaca)

- Loaded via `next/font/local` as `--font-pixel`; license: SIL OFL 1.1
  (`src/fonts/Ithaca-LICENSE-OFL.txt` must ship with the font)
- Use the `font-pixel` utility. Sizes: 14 / 16 / 20px. Below 14px it smears.
- Short strings only (1–4 words): badge names, quest category tags,
  "Milestone reached" eyebrows, playful section eyebrows on quest surfaces.
- Never: Scripture, prayers, body copy, legal text, primary button labels.

## Motion

Ambient only — flicker / sway / twinkle via the CSS token keyframes, plus
`pixelSparkle` (src/lib/motion.ts) for milestone reveals. Grid assets
animate per cell (only the flame flickers, only the glints twinkle); png
assets may animate as a whole via `ambientClassName`. All of it rides the
`.ambient` class / MotionConfig so reduced-motion kills it everywhere.

## Language guardrails

The Content Guide's never-list applies to pixel moments: no streak-loss
iconography, no "unlock(ed)" (say **reached** or **earned**), no XP, no
ranks. A milestone is a marker on a pilgrimage, not loot. The candle never
goes out as a punishment — an unlit candle is simply waiting to be lit.
