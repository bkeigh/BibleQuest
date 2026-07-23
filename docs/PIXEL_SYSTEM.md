# BibleQuest Pixel System

Sacred exploration, never retro-arcade. Pixel art is BibleQuest's signature
accent — a storybook voice for quest, growth, and celebration moments. It is
rationed on purpose: when everything is pixelated, nothing is special.

## The three instruments

| Instrument | Component / utility | Scale | Use |
|---|---|---|---|
| Small sprites | `PixelIcon` (`design-system/PixelIcon.tsx`) | 128×128 native art; 32×32 layout grid | Quest category glyphs, milestone marks, tiny decorations |
| Feature sprites | `PixelIcon` (same component) | 128×128 native art; 16×16 candle or 32×32 tree layout grids | The streak candle set, the twenty-stage journey tree |
| Mascots | `PixelMascot` (`design-system/PixelMascot.tsx`) | 128×128 native art; 32×32 layout grid | One per onboarding / sign-in page, big empty states |

Plus the accent font: `font-pixel` utility (Ithaca, SIL OFL), 14px minimum —
short labels only (badges, quest tags, tiny decorative headings). And two
surface utilities: `pixel-frame` / `pixel-frame-gold` (chunky 2px border +
hard offset shadow) for achievement-style cards only.

## The asset registry (`design-system/pixel-assets.ts`)

Every sprite and mascot lives in one registry file. Components are thin
resolvers: consumers reference assets by name and never know how the art is
stored. Production art begins with the approved BibleQuest reference sheet and
subject anchors, is staged through reference-conditioned image generation, and
is reconstructed on its native grid by `scripts/process-pixel-sprites.mjs`.
Only reviewed, normalized PNGs are promoted to `public/pixel/`; image generation
is not a runtime or build dependency. The registry intentionally accepts only
production PNGs:

```ts
{ kind: "png", src, cols, rows, ambientClassName? } // pre-drawn file
```

- `PIXEL_SPRITES` feeds `PixelIcon`; `PIXEL_MASCOTS` feeds `PixelMascot`.
- Every production PNG is exactly 128×128 physical pixels, regardless of
  family. The registry's logical columns and rows are independent rendering
  metadata, and each logical axis must divide 128 evenly.
- PNG entries separately declare `artCols` / `artRows`. These describe the
  authored pixel grid used by QA and never affect rendered UI dimensions.
- The `size` prop always means **px per cell**. A png entry declares its
  logical grid (`cols`/`rows`), so rendered dimensions are identical to the
  established component footprint.
- `cellScale` preserves historic component sizing while snapping every final
  cell to a whole CSS pixel. Small icons normally resolve to exactly 32×32.
  Production candles use `0.75`; mascots use `0.625` so size 7/8/9/10 call
  sites render at 128/160/192/192px without a 224px onboarding jump.
- Authored palettes use the exact black outline (`#000000`), evergreen
  (`#0e533c`), olive, brand gold (`#d3a336`), leather, parchment, charcoal,
  and restrained prayer blue, rose, stone, skin, and flame ramps. Lighter and
  darker material ramps are intentional shades of those live brand anchors.

### Staging and registering production PNGs

1. Use `PixelArtReferenceSheet.png` as the master style/palette reference and
   the approved subject PNGs in `BibleQuest-Assets/UI-ASSETS/` as shape anchors.
   Treat each input explicitly as a reference, not a file to resize blindly.
2. Stage generated or edited source art under
   `output/imagegen/pixel-v2/sources/`. Green subjects should use a uniform
   `#ff00ff` removable backdrop. Keep raw sources for traceability; never write
   model output straight into `public/pixel/`.
3. Normalize each approved source with the deterministic processor. For example:

   ```sh
   node scripts/process-pixel-sprites.mjs normalize \
     output/imagegen/pixel-v2/sources/praying-hands-alpha.png \
     output/imagegen/pixel-v2/production-128/praying-hands.png \
     128 128 alpha nearest
   ```

   The processor supplies binary alpha, transparent padding, capped adaptive
   palette mapping, and nearest-neighbor source fitting. Use `clean-supplied` for
   the approved opaque UI anchors and `qa-sheet` for a review contact sheet.
4. Keep every export at exactly **128×128 physical pixels**. Logical columns
   and rows must both divide 128 evenly. Every production family uses the full
   128×128 native art grid. Layout grids remain 16×16 for candles and 32×32 for
   every other family so higher fidelity does not change on-screen size. Use
   transparent square padding for narrow or tall subjects instead of
   introducing a non-square file.
5. Name files after their registry keys:
   `public/pixel/<name>.png` for sprites, `public/pixel/mascot-<name>.png`
   for mascots (e.g. `candle-halo.png`, `tree-stage-4.png`,
   `mascot-lamb.png`).
6. Review every staging asset at its actual in-app size and on parchment,
   linen, and candle surfaces. Reject malformed silhouettes, loose pixels,
   softened edges, inconsistent outlines, or sequence regressions. Only then
   copy the approved PNG into `public/pixel/`.
7. Register the PNG with its divisor-compatible logical grid:
   `{ kind: "png", src: "/pixel/candle-halo.png", cols: 16, rows: 16 }`.
8. Set `ambientClassName` only when the whole image should move subtly
   (for example `"[animation:var(--animate-flicker)]"`), or leave it off for
   stillness.

The service worker precaches the explicit 63-file catalogue, so new registry
filenames must also be added to `PIXEL_ASSET_NAMES` in `public/sw.js`. When
replacing bytes behind an existing filename, bump the worker cache version so
installed clients do not retain the rejected art.

Nothing else changes: names, sizes, a11y semantics, and every importing
file stay untouched.

## Grid & stroke rules

- Every sprite uses a whole-cell logical grid and `image-rendering: pixelated`
  (`pixelated` utility). Never scale to fractional cell sizes; never blur,
  never rotate.
- Every silhouette carries a single exact-black (`#000000`) outline. Small icons keep it
  sparse; mascots and feature sprites use it continuously so they remain
  recognizable on parchment, linen, and candle-mode surfaces.
- Every production file uses each native 128×128 pixel directly. There is no
  16×16, 32×32, or 64×64 reconstruction bottleneck. Gradients may be expressed
  only as deliberate adjacent flat palette colors, never interpolation within
  a pixel.
- Light comes from the **upper left**: highlights top-left and shade
  lower-right. Materials may use up to 5–7 deliberate ramp steps where the
  subject needs depth; dithering and within-pixel blending remain forbidden.
- Every sprite uses a reviewed source-faithful local palette so its material
  shading survives at native resolution. Every palette is deterministic and
  capped at 32 opaque colors; dithering and partial alpha are forbidden.

## Current inventory

- **Small sprites (30)**: candle, leaf, star, bird, flower, chapel, closed
  book, open book, bookmark, lantern, path, tree, sun, heart, hands, praying
  hands, wheat, dove, cross, door, key, scroll, compass, crown, mountain,
  moon, service basket, forgiveness links, community people, and fountain.
- **Streak candles (5, 128×128 source / 16×16 logical)**: `candle-unlit` → `candle-small` →
  `candle-steady` → `candle-sparks` → `candle-halo`. One shared body; only
  the flame and blessing details grow (see `candleStage` in
  `lib/questos/streak-engine.ts`). Lit candles flicker gently as a whole.
- **Journey tree stages (20, 128×128 source / 32×32 logical)**:
  `seed` → `stirring-seed` → `first-root` → `first-shoot` → `sprout` →
  `rooted-sprout` → `young-sapling` → `branching-sapling` →
  `leafing-sapling` → `young` → `growing` → `spreading` → `budding` →
  `flowering` → `first-fruit` → `fruit-bearing` → `flourishing` → `sturdy` →
  `shade` → `sheltering`. Registry keys remain `tree-stage-0` through
  `tree-stage-19`. Every stage shares one olive species, soil base, light
  direction, forked-trunk language, outline, and palette; the silhouette and
  botanical details advance at every step.
- **Mascots (8, 128×128 native art / 32×32 layout)**: lamb, lantern, scroll, dove, sprout, key,
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
`pixelSparkle` (src/lib/motion.ts) for milestone reveals. PNG assets may
animate as a whole via `ambientClassName`. All of it rides the
`.ambient` class / MotionConfig so reduced-motion kills it everywhere.

## Language guardrails

The Content Guide's never-list applies to pixel moments: no streak-loss
iconography, no "unlock(ed)" (say **reached** or **earned**), no XP, no
ranks. A milestone is a marker on a pilgrimage, not loot. The candle never
goes out as a punishment — an unlit candle is simply waiting to be lit.
