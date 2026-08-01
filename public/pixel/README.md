# BibleQuest strict 128x128 pixel remakes

This is a review-only remake catalogue. Nothing in the application’s
`public/pixel` directory was replaced.

## Output

- 62 PNG sprites and 2 animated GIFs
- Every frame is authored directly on a 128x128 RGBA grid
- No large-canvas generation, shrinking, smoothing, or resampling
- Binary alpha only: every pixel is fully transparent or fully opaque
- Transparent outer border
- Maximum 16 opaque colors per asset
- Approved exact-black or reference-charcoal exterior contour
- Hard, un-antialiased pixel edges

## Family rules

- Interface symbols use compact palettes and cleaned local color clusters.
- Tree stages use cumulative silhouettes so visible growth never reverses.
- Candle states share identical body geometry below the flame.
- The dove follows `PixelArtReferenceSheet.png`: compact landing pose,
  one-pixel charcoal edge, parchment shading, and an olive branch.
- `my-shepherd.png` is the MyShepherd AI companion: a humble Scripture guide
  with a crook, open Bible, green robe, prayer-blue mantle, and gold sparkle.
- Other mascots preserve the original geometry while consolidating color noise.
- GIFs retain their frame counts, 150 ms timing, infinite loop, and fixed
  128x128 frame registration.

## Review

The `_review` directory contains source-versus-remake sheets, animation frame
sheets, the unified QA report, and source integrity evidence.

These files should remain separate from production until they are visually
approved.
