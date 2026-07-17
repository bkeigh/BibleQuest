# BibleQuest pixel-v2 sources and 128×128 production pass

Generated with the built-in `image_gen` workflow. PixelLab was not used.
The original mixed-size staging outputs remain as provenance. The canonical
`process-production-128.mjs` pass now reconstructs all 63 sprites from the
high-resolution masters onto one exact 128×128 physical canvas and writes the
reviewed candidates to `production-128/`. The guarded installer promotes that
directory to `public/pixel/` after review.

## References

- `/Users/brendankenney/Pictures/BibleQuest-Assets/PixelArtReferenceSheet.png` — master style, palette, outline, and progression language
- `/Users/brendankenney/Pictures/BibleQuest-Assets/UI-ASSETS/BQ-UI-051c4d14-578d-4f67-be9f-e2d7f9353642.png` — sprout anchor
- `/Users/brendankenney/Pictures/BibleQuest-Assets/UI-ASSETS/BQ-UI-68d11709-9c44-4a5c-b393-5f29dae8e81c.png` — young-tree anchor
- `/Users/brendankenney/Pictures/BibleQuest-Assets/UI-ASSETS/BQ-UI-b698119c-43bb-4d5a-bcb2-16a77465d896.png` — mature-tree anchor
- `/Users/brendankenney/Pictures/BibleQuest-Assets/UI-ASSETS/BQ-UI-Candle-1.png` — candle body/holder anchor

## Tree prompt

> Create one coherent 20-stage olive-tree growth atlas, exactly 5 columns by
> 4 rows, read left-to-right and top-to-bottom. Image 1 is the authoritative
> BibleQuest master style and palette reference; Images 2–4 are the exact
> sprout, young-tree, and mature-tree anchors. Every cell is one isolated,
> centered sprite on the same baseline. Use a perfectly uniform flat solid
> `#ff00ff` chroma background. Strict native pixel sprite art: hard
> grid-aligned square clusters, continuous one-pixel `#1e3329` outline, flat
> stepped shading, no antialiasing, smoothing, soft effects, text, labels,
> borders, or dividers. Keep one olive species, viewpoint, soil language,
> upper-left light, forked-trunk language, and exact shared palette. Exact
> order: closed seed; cracked seed with first root; longer forked root; first
> green shoot; two-leaf sprout; rooted three-leaf sprout; four-leaf sapling;
> first fork and six leaves; two branchlets and eight leaves; sparse young
> forked tree; taller three-branch young tree; broader spreading tree; budding;
> flowering; exactly three first olives; mature fruit-bearing; flourishing
> flowers and fruit; sturdy old tree; broad shade tree; sheltering ancient tree.
> Use only `#1e3329`, `#0a3f2e`, `#1f5e3a`, `#6b8f4e`, `#a8b98c`,
> `#5d3b24`, `#8b5e34`, `#b7834b`, `#daaf37`, `#f2cf63`, `#f6e9d1`, and
> `#fffaf0` in the subjects. No full tree before cell 10; no faces, animals,
> pots, scenery, loose leaves, stars, cast shadows, glow, watermark, or extra
> objects.

## Candle prompt

> Create one coherent horizontal atlas of exactly five isolated candle states.
> Image 1 is the BibleQuest master sheet and Image 2 is the exact candle-body,
> brass-holder, proportion, outline, shading, and flame anchor. Every state
> uses the same body, wick position, holder, scale, and baseline; change only
> flame, spark, and halo details. Use a perfectly uniform flat solid `#ff00ff`
> chroma background. Strict native pixel art with hard square clusters,
> continuous one-pixel `#1e3329` outline, and no antialiasing, blur, bloom,
> translucent pixels, labels, borders, or text. Left-to-right: unlit; tiny
> first flame; taller steady flame; steady flame with exactly two sparks;
> steady flame with two sparks and one restrained hard-pixel halo ring. Shared
> palette: `#1e3329`, `#2c2c2c`, `#5d3b24`, `#8b5e34`, `#6f531d`,
> `#daaf37`, `#f2cf63`, `#d9c49b`, `#f6e9d1`, `#fffaf0`, `#e8872d`, and
> `#ffd45a`. No smoke, faces, scenery, surface shadow, reflection, soft halo,
> watermark, extra candles, or extra objects.

## Sources and processing

- `sources/tree-progression-atlas.png` — untouched built-in result, SHA-256 `284dafc83cd423130394499d5a33504f80eb8f4b0c4fe7b37fb230686147bec3`
- `sources/candle-states-atlas.png` — untouched built-in result, SHA-256 `9f4e903b1a207de20885d8df41fad0e1da6025f56718257af587d870540da3e2`
- `sources/*-chroma-normalized.png` — exact `#ff00ff` background plus fixed subject palette
- `staging/trees/tree-stage-0.png` through `tree-stage-19.png` — legacy 64×64 indexed PNG
- `staging/candles/candle-unlit.png` through `candle-halo.png` — legacy 32×36 indexed PNG
- `process-atlases.mjs` — deterministic hard-key, component extraction, nearest-neighbor normalization, fixed-palette encoder, and preview builder
- `process-production-128.mjs` — canonical 63-file reconstruction, promotion,
  preview, and physical-QA pass
- `production-128/` — reviewed 128×128 indexed PNG source for promotion

The raw model outputs used near-magenta color variation instead of literal
`#ff00ff`. The processor globally classifies that chroma family, gives it
binary alpha, maps every opaque pixel to the fixed palette, and writes a
separate normalized atlas with a truly uniform `#ff00ff` field. No soft matte
or alpha feathering is used.

The tree source contains exactly twenty isolated connected components. They
are ordered by atlas row and x-position, normalized with one shared scale, and
aligned to the same output baseline. The candle frames are normalized with one
shared scale; rows 13–35 use the unlit frame as a canonical body so the body
and holder are byte-identical in every state.

## Historical staging QA

- 20/20 distinct tree frames at exactly 64×64
- 5/5 distinct candle frames at exactly 32×36
- indexed PNG, binary alpha only (`0` or `255`), transparent corners
- every opaque pixel belongs to the declared fixed palette
- all twenty trees have at least two pixels of horizontal edge clearance
- all tree frames share baseline row 60
- all five candle-body regions have one shared hash
- visual review passed on parchment in `tree-staging-preview.png` and `candle-staging-preview.png`

No model reroll was needed. The only generation deviation was the nonuniform
near-magenta raw backdrop; the exact-chroma and transparent deliverables fix it
deterministically.

## Current production QA

- 63/63 distinct indexed PNGs at exactly 128×128
- binary alpha only, fully transparent outer borders, and 7–24 colors per file
- every opaque color belongs to the shared 31-color BibleQuest palette
- the guarded installer makes `production-128/` and `public/pixel/`
  byte-identical after review
- all twenty tree stages, five candle states, and eight mascots remain distinct
- second-pass edge cleanup removed detached strips from `hands` and
  `mascot-sprout` while preserving intentional sparks, rays, and broken links
- logical registry axes divide 128 evenly
