/**
 * Install the reviewed ImageGen/reference sprite set into public/pixel.
 *
 * The staging paths are deliberately explicit so an unreviewed generation can
 * never replace a production sprite by accident.
 */

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const stagingRoot = path.join(root, "output", "imagegen", "pixel-v2");
const publicRoot = path.join(root, "public", "pixel");

const reviewedSmallSprites = {
  "bird.png": "staging/utilities/bird.png",
  "book.png": "supplied/book.png",
  "bookmark.png": "supplied/bookmark.png",
  "candle.png": "supplied/candle.png",
  "chapel.png": "categories/worship.png",
  "compass.png": "staging/utilities/compass.png",
  "cross.png": "staging/utilities/cross.png",
  "crown.png": "staging/utilities/crown.png",
  "door.png": "staging/utilities/door.png",
  "dove.png": "supplied/dove.png",
  "flower.png": "staging/utilities/flower.png",
  "fountain.png": "categories/reflection.png",
  "hands.png": "categories/family.png",
  "heart.png": "categories/kindness.png",
  "key.png": "staging/utilities/key.png",
  "lantern.png": "supplied/lantern.png",
  "leaf.png": "staging/utilities/leaf.png",
  "links.png": "categories/forgiveness.png",
  "moon.png": "categories/silence.png",
  "mountain.png": "staging/utilities/mountain.png",
  "open-book.png": "supplied/open-book.png",
  "path.png": "supplied/path.png",
  "people.png": "categories/community.png",
  "praying-hands.png": "curated/praying-hands.png",
  "scroll.png": "supplied/scroll.png",
  "service-basket.png": "categories/service.png",
  "star.png": "categories/gratitude.png",
  "sun.png": "staging/utilities/sun.png",
  "tree.png": "supplied/tree.png",
  "wheat.png": "categories/generosity.png",
};

const reviewedCandles = [
  "candle-unlit.png",
  "candle-small.png",
  "candle-steady.png",
  "candle-sparks.png",
  "candle-halo.png",
];

const reviewedMascots = [
  "mascot-lamb.png",
  "mascot-lantern.png",
  "mascot-scroll.png",
  "mascot-dove.png",
  "mascot-sprout.png",
  "mascot-key.png",
  "mascot-map.png",
  "mascot-campfire.png",
];

const copies = [
  ...Object.entries(reviewedSmallSprites),
  ...reviewedCandles.map((file) => [file, `staging/candles/${file}`]),
  ...Array.from({ length: 20 }, (_, stage) => [
    `tree-stage-${stage}.png`,
    `staging/trees/tree-stage-${stage}.png`,
  ]),
  ...reviewedMascots.map((file) => [file, `staging/mascots/${file}`]),
];

if (copies.length !== 63 || new Set(copies.map(([target]) => target)).size !== 63) {
  throw new Error("The reviewed production sprite contract must contain 63 unique files.");
}

await mkdir(publicRoot, { recursive: true });
for (const [target, source] of copies) {
  await copyFile(path.join(stagingRoot, source), path.join(publicRoot, target));
}

console.log(`Installed ${copies.length} reviewed sprites in ${publicRoot}`);
