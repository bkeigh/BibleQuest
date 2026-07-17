# BibleQuest Production Sprite Pipeline

BibleQuest ships a reviewed 63-file transparent PNG catalogue. Art creation and
runtime delivery are deliberately separate: reference-conditioned ImageGen
creates editable staging sources, while a deterministic local processor owns
native-grid reconstruction, alpha, palette, and the uniform 128×128 physical
canvas. The app never generates art at runtime and no provider credential is
part of the build.

The live registry remains stable: screens request a named `PixelIcon` or
`PixelMascot`; `src/components/design-system/pixel-assets.ts` owns its public
file source and logical canvas.

## Production contract

| Family | Files | Physical PNG | Registry grid |
| --- | ---: | ---: | ---: |
| Small interface/category sprites | 30 | 128×128 | 32×32 |
| Streak-candle states | 5 | 128×128 | 16×16 |
| Olive-tree stages | 20 | 128×128 | 32×32 |
| Feature mascots | 8 | 128×128 | 32×32 |

Physical and logical dimensions are separate contracts. Every shipped file is
exactly 128×128; the smaller registry grids remain layout metadata so existing
call sites keep their established rendered scale. Every logical row
and column count must divide 128 evenly; current grids are 32×32 for small
sprites, trees, and mascots, and 16×16 for candles. Transparent square padding
preserves the candles' narrow silhouette within their square logical grid.

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

`output/imagegen/pixel-v2/process-production-128.mjs` is the canonical full-set
production tool. It rebuilds every family from the high-resolution masters,
removes connected opaque backdrops, reconstructs binary alpha, maps every
opaque pixel to the fixed BibleQuest palette, uses transparent padding, and
normalizes without soft resampling. Run it before review:

```sh
node output/imagegen/pixel-v2/process-production-128.mjs \
  /path/to/BibleQuest-Assets/UI-ASSETS
```

`scripts/process-pixel-sprites.mjs` remains the provider-neutral utility for
cleaning supplied anchors, normalizing one candidate, and building ad-hoc QA
sheets.

Clean the supplied opaque anchors:

```sh
node scripts/process-pixel-sprites.mjs clean-supplied \
  /path/to/BibleQuest-Assets/UI-ASSETS \
  output/imagegen/pixel-v2/supplied
```

Normalize one approved transparent/chroma-keyed source:

```sh
node scripts/process-pixel-sprites.mjs normalize \
  output/imagegen/pixel-v2/sources/praying-hands-alpha.png \
  output/imagegen/pixel-v2/production-128/praying-hands.png \
  128 128 alpha nearest
```

Build a review sheet:

```sh
node scripts/process-pixel-sprites.mjs qa-sheet \
  output/imagegen/pixel-v2/production-128 \
  output/imagegen/pixel-v2/production-128-contact-sheet.png
```

Atlas families may use a family-specific splitter in the staging directory,
but it must finish with the same invariants: exact dimensions, fixed palette,
binary alpha, nearest-neighbor reconstruction, shared baseline, and distinct
frames. Keep that processing recipe beside its raw atlas and generation notes
so the result remains reproducible.

The older mixed-size staging files remain as provenance only. The canonical
processor supersedes those exports and writes the reviewed uniform set to
`output/imagegen/pixel-v2/production-128/` and `public/pixel/`.

## 3. Review before promotion

Review every candidate at its true 128×128 source size and at its actual
smaller rendered size in the app. A zoomed contact sheet alone is not approval.

Required checks:

- exactly 128×128 physical dimensions for all 63 files;
- alpha values are only 0 or 255, with transparent corners and safe padding;
- every opaque RGB value belongs to the shared production palette;
- opaque-color budgets remain 16 for small sprites and candles, 20 for
  mascots, and 24 for trees unless a reviewed per-file exception is recorded
  in the manifest;
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
2. Reject promotion unless every file is exactly 128×128 with the required
   alpha, palette, padding, and edge clearance.
3. Keep registry logical dimensions aligned with `asset-manifest.json` in
   `src/components/design-system/pixel-assets.ts`.
4. Keep category mappings in `PixelIcon.tsx` semantically distinct; prayer uses
   `praying-hands`.
5. Keep every production path in the explicit catalogue in `public/sw.js`.
6. Bump the service-worker cache version when replacing bytes behind existing
   names, so installed clients receive the approved art immediately.
7. Run the pixel, service-worker, growth, type, lint, test, and build checks.
8. Inspect mobile and desktop screens, reduced motion, candle mode, and a true
   offline reload.

Use `node scripts/install-imagegen-sprites.mjs` for promotion; it reads only
the reviewed `production-128` directory and rejects any non-128×128 source.

Registry paths, accessibility behavior, and consuming components remain stable.
Logical sizes follow the divisor-compatible values in the manifest: 16×16 for
candles and 32×32 for every other production family.

See `docs/PIXEL_SYSTEM.md` for placement, typography, motion, and product-tone
guardrails.
