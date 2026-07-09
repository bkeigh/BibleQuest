# BibleQuest Pixel System

Sacred exploration, never retro-arcade. Pixel art is BibleQuest's signature
accent — a storybook voice for quest, growth, and celebration moments. It is
rationed on purpose: when everything is pixelated, nothing is special.

## The three instruments

| Instrument | Component / utility | Scale | Use |
|---|---|---|---|
| Small sprites | `PixelIcon` (`design-system/PixelIcon.tsx`) | 5–8 cell grids, 4–8px cells | Quest category glyphs, milestone marks, tiny decorations |
| Mascots | `PixelMascot` (`design-system/PixelMascot.tsx`) | 12–18 cell grids, 8–11px cells | One per onboarding / sign-in page, big empty states |
| Accent font | `font-pixel` utility (Ithaca, SIL OFL) | 14px minimum | Short labels: badges, quest tags, tiny decorative headings |

Plus two surface utilities: `pixel-frame` / `pixel-frame-gold` (chunky 2px
border + hard offset shadow) for achievement-style cards only.

## Grid & stroke rules

- Every sprite lives on a whole-cell grid rendered as SVG `<rect>`s with
  `image-rendering: pixelated` (`pixelated` utility). Never scale to
  fractional cell sizes; never blur, never rotate.
- **Mascots** carry a single 1-cell outline in twilight (`#1e3329`).
  **Small sprites** are flat (no outline) — they read as marks, not characters.
- Max ~6 colors per sprite, drawn only from the shared palette constants
  (mirrors of the `@theme` tokens): twilight outline, warm white/parchment,
  brand evergreen `#0e533c`, brand gold `#d3a336` + light gold, olive pair,
  flame orange, face brown/tan, rose, marian blue.

## Where pixel art is allowed

- Quest UI: category glyphs, picked/completed marks, the quests empty state
- Achievement/milestone cards and reveals (with `pixel-frame-gold`)
- Onboarding + sign-in: exactly **one mascot per page, centered, medium**
- Empty states (one small sprite or one mascot, never both)
- Growth/journey celebration moments (`pixelSparkle` preset, ambient only)

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
`pixelSparkle` (src/lib/motion.ts) for milestone reveals. All of it rides
the `.ambient` class / MotionConfig so reduced-motion kills it everywhere.

## Language guardrails

The Content Guide's never-list applies to pixel moments: no streak
iconography, no "unlock(ed)" (say **reached** or **earned**), no XP, no
ranks. A milestone is a marker on a pilgrimage, not loot.
