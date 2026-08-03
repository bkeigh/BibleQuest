# BibleQuest hand-painted 2.5D art system

BibleQuest uses a cohesive, tactile 2.5D illustration language: softly rounded
volume, crisp silhouettes, warm upper-left light, cool lower-right bounce,
controlled texture, saturated midtones, and broad readable planes. It should
feel like a painted miniature in a devotional storybook, never like generic 3D,
flat vector art, or a game-sprite set.

## Production contract

| Family | Runtime format | Canvas | Motion |
| --- | --- | ---: | --- |
| Objects and category marks | transparent WebP | 512×512 | still |
| Mascots and companions | transparent WebP | 512×512 | still |
| Journey tree stages | transparent WebP | 512×512 | still |
| Daily-streak candles | transparent WebP + GIF | 512×512 | 16 frames, 100ms per frame, seamless 1.6s loop |

The catalogue contains 58 still illustrations and six candle loops. Candle
motion is the sole exception to the still-art policy. Do not ship animated
doves, lambs, campfires, trees, stars, or other decorative artwork.

## Runtime components

- `ArtIcon` renders small and feature illustrations from `ART_SPRITES`.
- `ArtMascot` renders larger still companions from `ART_MASCOTS`.
- `ART_ICON` supplies semantic size roles; a measured optical-weight map keeps
  unusually narrow or broad silhouettes balanced at the same nominal size.
- `CATEGORY_ART` owns the one-to-one quest-category mapping.
- Call sites reference registry keys, never public filenames directly.

Static images use smooth resampling, transparent edges, and restrained drop
shadows. Do not apply `image-rendering: pixelated`, hard outlines, block grids,
or nearest-neighbor scaling. Navigation and form controls remain simple vector
icons so illustrations retain a clear role in the hierarchy.

## Candle motion

Pass `animate` to `ArtIcon` only for a candle key. The component pairs the
reviewed GIF with its matching still and lets both the operating-system motion
preference and BibleQuest's Reduce Motion setting select the still image.

All candle states share the same sculpted body, camera, lighting, palette,
baseline, and silhouette. Only flame shape, glow, sparks, and small reflected
light changes may move. Each loop must contain exactly 16 frames at 100ms per
frame and loop infinitely without a visible jump.

## Promoting approved artwork

The high-resolution reviewed masters live outside the app repository in the
BibleQuest asset library. Build the checked-in runtime catalogue with:

```bash
pnpm art:install
# Or on another machine:
pnpm art:install /path/to/Assets-BibleQuest/2.5D
```

The installer:

1. Requires exactly 58 root-level PNG masters.
2. converts each still to a transparent 512×512 WebP;
3. copies only the six approved candle GIFs;
4. writes `public/art/2.5d/manifest.json`; and
5. clears only the explicit generated `public/art/2.5d` destination first, so
   retired files cannot linger.

After any art change, review subjects on Paper, Candlelight, Light, and Dark
themes at their actual UI sizes. Then run the asset, service-worker, reduced
motion, full test, lint, TypeScript, and production-build checks. Add any new
runtime filename to the explicit service-worker allowlist and bump its cache
version so installed apps cannot retain older art. Keep worker installation
light: only assets required by the offline, app, and onboarding shells belong
in `PRECACHE_ART_PATHS`; the remaining catalogue is cached when first used.

## Placement guardrails

- Keep one obvious illustrated focal point per card or feature region.
- Use a single mascot in onboarding and empty states.
- Keep Scripture, prayer text, controls, and dense utility UI free of decorative
  art that competes with reading.
- Preserve transparent breathing room; do not crop silhouettes into containers.
- Use the editorial display face for short accent labels. The retired Ithaca
  pixel font and pixel-frame utilities are not part of the active design system.
- Keep product motion calm. UI transitions may still guide state changes, but
  the only frame-by-frame illustrated animation is the candle.
