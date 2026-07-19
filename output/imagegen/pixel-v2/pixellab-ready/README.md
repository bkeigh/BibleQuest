# PixelLab-ready BibleQuest pixel art

`catalogue/` contains disposable upload copies of the complete 63-file
production set. `mascots/` contains the eight large mascot files separately
for the most common animation workflow.

Both directories are refreshed automatically by
`node scripts/install-imagegen-sprites.mjs` after a reviewed production build.

Every file is a clean animation input for its BibleQuest subject. Each file is:

- exactly 128×128 pixels;
- transparent outside the subject;
- built directly on the full 128×128 native art grid with no resolution
  bottleneck;
- limited to a reviewed source-faithful indexed palette;
- outlined with one exact-black (`#000000`) contour;
- free of disconnected fragments and partial-alpha edge pixels.

Every file in `catalogue/` follows the same artifact-free indexed-color
contract and retains native one-pixel detail. No file is enlarged from a
smaller 16×16, 32×32, or 64×64 art grid.

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
