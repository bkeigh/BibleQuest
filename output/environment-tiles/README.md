# BibleQuest environment tiles

This set contains twelve separate, opaque 32 × 32 PNG environment tiles derived from the supplied reference board. Use the files in `tiles-32/` for PixelLab. The large files in `sources/` are retained only as editable generated masters.

## Contents

| File | Tile |
| --- | --- |
| `parchment-ground.png` | Warm parchment/sand ground; seamless texture |
| `stone-path.png` | Mossy fitted stone paving; seamless texture |
| `grass-edge.png` | Grass ledge over exposed brown soil |
| `small-flowers.png` | Deep green grass with small white/yellow daisies |
| `tree-roots.png` | Exposed twisting roots over dark earth |
| `wooden-fence.png` | Rustic wooden fence among grass and tiny flowers |
| `quiet-hill-signpost.png` | Blank wooden signpost over a grassy mound |
| `morning-sky-hills.png` | Blue morning sky with clouds and layered hills |
| `morning-sky-sun.png` | Blue sky with a golden rising sun and distant hills |
| `soft-cloud.png` | Pale blue sky with a large soft cumulus cloud |
| `candle-desk-tile.png` | Candlelit wooden desk with a small prayer book and writing item |
| `prayer-garden-stone.png` | Gray cross-carved garden marker, grass, and flowers |

## Agent workflow used

1. A visual director extracted the shared style: warm, storybook 16/32-bit pixel art; restricted earthy palette; chunky square pixels; no text, UI frames, watermarks, or transparency.
2. The terrain agent independently generated the four repeatable ground tiles.
3. The nature/props agent independently generated the four pastoral prop tiles, keeping the signboard blank.
4. The sky/interior agent independently generated the four atmosphere and interior tiles, treating the two reference "Morning Sky" examples as separate assets.
5. A finishing pass sampled each generated master to an exact 32 × 32 RGB PNG using nearest-neighbor resampling, capped every palette at 64 colors, and checked the final sheet at 8× nearest-neighbor scale.

## Generation brief

All agents used the reference board only for art direction. Every image used this common prompt constraint:

> One full opaque square game tile, designed as a 32 × 32 logical-pixel grid, in warm handcrafted BibleQuest storybook pixel art with a limited palette and crisp chunky pixels. Fill the canvas edge to edge. No labels, text, UI framing, borders, checkerboard, transparency, watermark, anti-aliasing, smooth gradients, or painterly rendering.

Asset-specific requests were: parchment ground; mossy fitted stone path; grass ledge over soil; grass with five small daisies; exposed roots over earth; rustic fence in grass; blank signpost on grassy mound; sky over layered green hills; blue sky with rising golden sun; a soft cumulus cloud in powder-blue sky; candlelit wood desk with a book and writing item; and a cross-carved garden stone in flowers.

## PixelLab import

Upload the individual native PNG files from `tiles-32/`; do not upload the 8× visual check sheet. Keep their 32 × 32 dimensions and use nearest-neighbor scaling wherever PixelLab exposes an interpolation option.
