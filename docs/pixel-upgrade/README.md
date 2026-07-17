# BibleQuest Production Sprite Pipeline

BibleQuest ships a reviewed 63-file transparent PNG catalogue. Art creation and
runtime delivery are deliberately separate: reference-conditioned ImageGen
creates editable staging sources, while a deterministic local processor owns
native-grid reconstruction, alpha, palette, and final dimensions. The app never
generates art at runtime and no provider credential is part of the build.

The live registry remains stable: screens request a named `PixelIcon` or
`PixelMascot`; `src/components/design-system/pixel-assets.ts` owns its public
file source and logical canvas.

## Production contract

| Family | Files | Physical PNG | Registry grid |
| --- | ---: | ---: | ---: |
| Small interface/category sprites | 30 | 32×32 | 32×32 |
| Streak-candle states | 5 | 32×36 | 16×18 |
| Olive-tree stages | 20 | 64×64 | 32×32 |
| Feature mascots | 8 | 48×48 | 48×48 |

Navigation and form controls remain clean vector icons. Pixel art is reserved
for quests, growth, milestones, onboarding, and meaningful empty states. The
exact names and family membership live in `asset-manifest.json` beside this
guide.

## 1. Anchor the source

Use the approved `PixelArtReferenceSheet.png` as the master style and palette
reference. Use the subject PNGs in `BibleQuest-Assets/UI-ASSETS/` as explicit
shape anchors. A reference image guides silhouette, materials, viewpoint,
outline, and shading; it is not a production sprite to shrink automatically.

For new or revised art:

- state each reference image's role in the generation prompt;
- request strict native pixel clusters, one dark-evergreen outline, upper-left
  light, flat stepped shading, and the shared BibleQuest palette;
- use a uniform removable chroma field (`#ff00ff` for green subjects);
- prohibit text, frames, cast shadows, blur, soft glow, partial transparency,
  checkerboards, and unrelated scenery;
- for a family sequence, generate one coherent atlas so body/species, baseline,
  light, and scale remain stable.

Save untouched results under `output/imagegen/pixel-v2/sources/`. Do not write
generated files directly into `public/pixel/`.

## 2. Reconstruct the native grid

`scripts/process-pixel-sprites.mjs` is the provider-neutral production tool. It
removes connected opaque backdrops, reconstructs binary alpha, maps every
opaque pixel to the fixed BibleQuest palette, uses transparent padding, and
normalizes without soft resampling.

Clean the supplied opaque anchors:

```sh
node scripts/process-pixel-sprites.mjs clean-supplied \
  /path/to/BibleQuest-Assets/UI-ASSETS \
  output/imagegen/pixel-v2/supplied
```

Normalize one approved transparent/chroma-keyed source:

```sh
node scripts/process-pixel-sprites.mjs normalize \
  output/imagegen/pixel-v2/sources/praying-hands.png \
  output/imagegen/pixel-v2/staging/praying-hands.png \
  32 32 alpha nearest
```

Build a review sheet:

```sh
node scripts/process-pixel-sprites.mjs qa-sheet \
  output/imagegen/pixel-v2/staging \
  output/imagegen/pixel-v2/staging-contact-sheet.png
```

Atlas families may use a family-specific splitter in the staging directory,
but it must finish with the same invariants: exact dimensions, fixed palette,
binary alpha, nearest-neighbor reconstruction, shared baseline, and distinct
frames. Keep that processing recipe beside its raw atlas and generation notes
so the result remains reproducible.

## 3. Review before promotion

Review every candidate at the true 32px/48px/64px source size and at its actual
rendered size in the app. A zoomed contact sheet alone is not approval.

Required checks:

- exact family dimensions and expected file count;
- alpha values are only 0 or 255, with transparent corners and safe padding;
- every opaque RGB value belongs to the shared production palette;
- no antialiased fringe, isolated noise, checkerboard residue, or chroma spill;
- silhouettes remain unmistakable at the smallest call site;
- category marks are visually distinct — especially `praying-hands`, `hands`,
  and `service-basket`;
- the five candles share one body and holder; only flame, sparks, and halo grow;
- all twenty tree stages share olive species, viewpoint, baseline, light,
  palette, soil/trunk language, and genuine incremental development;
- no readable text or letter-like artifacts on books, scrolls, or maps.

Regenerate or reconstruct a failed asset; do not rename an unrelated image to
make a sequence appear complete.

## 4. Promote and ship

1. Copy only approved normalized files to `public/pixel/<registry-key>.png`.
2. Keep registry logical dimensions unchanged in
   `src/components/design-system/pixel-assets.ts`.
3. Keep category mappings in `PixelIcon.tsx` semantically distinct; prayer uses
   `praying-hands`.
4. Keep every production path in the explicit catalogue in `public/sw.js`.
5. Bump the service-worker cache version when replacing bytes behind existing
   names, so installed clients receive the approved art immediately.
6. Run the pixel, service-worker, growth, type, lint, test, and build checks.
7. Inspect mobile and desktop screens, reduced motion, candle mode, and a true
   offline reload.

The registry paths, logical sizes, accessibility behavior, and consuming
components remain unchanged by an art-only replacement.

See `docs/PIXEL_SYSTEM.md` for placement, typography, motion, and product-tone
guardrails.
