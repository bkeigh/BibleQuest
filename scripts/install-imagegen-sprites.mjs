/**
 * Install the reviewed ImageGen/reference sprite set into public/pixel.
 *
 * The staging paths are deliberately explicit so an unreviewed generation can
 * never replace a production sprite by accident.
 */

import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const productionRoot = path.join(
  root,
  "output",
  "imagegen",
  "pixel-v2",
  "production-128"
);
const publicRoot = path.join(root, "public", "pixel");
const pixelLabRoot = path.join(
  root,
  "output",
  "imagegen",
  "pixel-v2",
  "pixellab-ready"
);
const pixelLabCatalogueRoot = path.join(pixelLabRoot, "catalogue");
const pixelLabMascotRoot = path.join(pixelLabRoot, "mascots");

const reviewedSmallSprites = [
  "bird.png",
  "book.png",
  "bookmark.png",
  "candle.png",
  "chapel.png",
  "compass.png",
  "cross.png",
  "crown.png",
  "door.png",
  "dove.png",
  "flower.png",
  "fountain.png",
  "hands.png",
  "heart.png",
  "key.png",
  "lantern.png",
  "leaf.png",
  "links.png",
  "moon.png",
  "mountain.png",
  "open-book.png",
  "path.png",
  "people.png",
  "praying-hands.png",
  "scroll.png",
  "service-basket.png",
  "star.png",
  "sun.png",
  "tree.png",
  "wheat.png",
];

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
  ...reviewedSmallSprites.map((file) => [file, file]),
  ...reviewedCandles.map((file) => [file, file]),
  ...Array.from({ length: 20 }, (_, stage) => [
    `tree-stage-${stage}.png`,
    `tree-stage-${stage}.png`,
  ]),
  ...reviewedMascots.map((file) => [file, file]),
];

if (copies.length !== 63 || new Set(copies.map(([target]) => target)).size !== 63) {
  throw new Error("The reviewed production sprite contract must contain 63 unique files.");
}

const expectedSources = copies.map(([, source]) => source).sort();
const productionSources = (await readdir(productionRoot))
  .filter((file) => file.endsWith(".png"))
  .sort();
if (JSON.stringify(productionSources) !== JSON.stringify(expectedSources)) {
  throw new Error("production-128 must contain exactly the reviewed 63-file contract");
}

await Promise.all([
  mkdir(publicRoot, { recursive: true }),
  mkdir(pixelLabCatalogueRoot, { recursive: true }),
  mkdir(pixelLabMascotRoot, { recursive: true }),
]);
for (const [target, source] of copies) {
  const sourcePath = path.join(productionRoot, source);
  const metadata = await sharp(sourcePath).metadata();
  if (metadata.width !== 128 || metadata.height !== 128) {
    throw new Error(`${source}: expected a reviewed 128x128 production PNG`);
  }
  await Promise.all([
    copyFile(sourcePath, path.join(publicRoot, target)),
    copyFile(sourcePath, path.join(pixelLabCatalogueRoot, target)),
    ...(reviewedMascots.includes(target)
      ? [copyFile(sourcePath, path.join(pixelLabMascotRoot, target))]
      : []),
  ]);
}

console.log(
  `Installed ${copies.length} reviewed sprites in ${publicRoot} and ${pixelLabCatalogueRoot}`
);
