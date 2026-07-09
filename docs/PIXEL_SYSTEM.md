# BibleQuest Pixel System

Sacred exploration, never retro-arcade. Pixel art is BibleQuest's signature
accent — a storybook voice for quest, growth, and celebration moments. It is
rationed on purpose: when everything is pixelated, nothing is special.

## The three instruments

| Instrument | Component / utility | Scale | Use |
|---|---|---|---|
| Small sprites | `PixelIcon` (`design-system/PixelIcon.tsx`) | 5–8 cell grids, 4–8px cells | Quest category glyphs, milestone marks, tiny decorations |
| Feature sprites | `PixelIcon` (same component) | 10–28 cell grids, 3–6px cells | The streak candle set, the journey tree stages |
| Mascots | `PixelMascot` (`design-system/PixelMascot.tsx`) | 12–18 cell grids, 8–11px cells | One per onboarding / sign-in page, big empty states |

Plus the accent font: `font-pixel` utility (Ithaca, SIL OFL), 14px minimum —
short labels only (badges, quest tags, tiny decorative headings). And two
surface utilities: `pixel-frame` / `pixel-frame-gold` (chunky 2px border +
hard offset shadow) for achievement-style cards only.

## The asset registry (`design-system/pixel-assets.ts`)

Every sprite and mascot lives in one registry file. Components are thin
resolvers: consumers reference assets by name and never know how the art is
stored. Each entry is one of two kinds:

```ts
{ kind: "grid", rows, palette, ambient? }         // hand-placed characters
{ kind: "png", src, cols, rows, ambientClassName? } // pre-drawn file
```

- `PIXEL_SPRITES` feeds `PixelIcon`; `PIXEL_MASCOTS` feeds `PixelMascot`.
- The `size` prop always means **px per cell**. A png entry declares its
  logical grid (`cols`/`rows`), so rendered dimensions are identical to the
  grid it replaces — no call site ever changes.
- Palette colors come only from the named constants at the top of the file
  (mirrors of the `@theme` tokens). No raw hex inside a sprite definition.

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
- **Mascots and feature sprites** carry a single 1-cell outline in twilight
  (`#1e3329`). **Small sprites** are flat (no outline) — they read as
  marks, not characters.
- Light comes from the **upper left**: highlights top-left, shade
  lower-right, 2–3 shade levels per material, minimal dithering.
- Small sprites: max ~6 colors. Feature sprites may use up to ~10 (outline,
  three canopy greens, two trunk browns, fruit gold pair, rose pair) —
  always drawn from the shared palette constants: twilight outline, warm
  white/parchment, brand evergreen `#0e533c`, brand gold `#d3a336` + light
  gold, olive pair, flame orange, face brown/tan, rose, marian blue.

## Current inventory

- **Small sprites (23)**: candle, leaf, star, bird, flower, chapel, book,
  bookmark, lantern, path, tree, sun, heart, hands, wheat, dove, cross,
  door, key, scroll, compass, crown, mountain.
- **Streak candles (5, 10×14)**: `candle-unlit` → `candle-small` →
  `candle-steady` → `candle-sparks` → `candle-halo`. One shared body; only
  the flame grows (see `candleStage` in `lib/questos/streak-engine.ts`).
  Flame cells flicker via `ambient`. Drawn to read at size 3 (30×42px).
- **Journey tree stages (6, 28×28)**: `tree-stage-0` (seed + sprout) →
  `tree-stage-5` (sheltering, fruit + roses + gold crown). Lobed canopies
  lit from the upper left, curved two-tone trunks with root flare, gold
  fruit at the canopy's lower edge. Gold glints twinkle via `ambient`.
  Drawn to read at sizes 4–6 (112–168px).
- **Mascots (8, 12–18 cells)**: lamb, lantern, scroll, dove, sprout, key,
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
