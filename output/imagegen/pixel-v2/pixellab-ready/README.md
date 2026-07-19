# PixelLab-ready BibleQuest pixel art

`catalogue/` contains disposable upload copies of the complete 63-file
production set. `mascots/` contains the eight large mascot files separately
for the most common animation workflow.

The files in `mascots/` are clean animation inputs for the BibleQuest mascot
family. Each file is:

- exactly 128×128 pixels;
- transparent outside the subject;
- built on a 32×32 logical art grid, with every logical pixel exported as one
  uniform 4×4 block;
- limited to the approved BibleQuest palette;
- outlined with one exact-black (`#000000`) contour;
- free of disconnected fragments and partial-alpha edge pixels.

Every file in `catalogue/` follows the same contract. Small sprites, trees,
and mascots use uniform 4×4 physical blocks. The candle sequence uses uniform
8×8 physical blocks.

For onboarding, animate `mascot-map`, `mascot-scroll`, `mascot-lantern`,
`mascot-campfire`, `mascot-dove`, and `mascot-sprout`. `mascot-lamb` and
`mascot-key` are included so the whole large-mascot family stays coherent.

## Returning an animation to the app

Prefer an animated PNG (APNG) on the same 128×128 transparent canvas. Keep the
original basename, then replace both:

1. `public/pixel/mascot-<name>.png`
2. `output/imagegen/pixel-v2/production-128/mascot-<name>.png`

After replacing live bytes, bump `CACHE_VERSION` in `public/sw.js` so installed
clients do not retain the older image. GIF or animated WebP exports require a
registry-path and offline-catalogue change; APNG preserves the current drop-in
workflow.
