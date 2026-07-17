/** Build human-review contact sheets for the production sprite library. */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const spriteDir = path.join(root, "public", "pixel");
const outputDir = path.join(root, "output", "imagegen", "pixel-v2");

const small = [
  "bird",
  "book",
  "bookmark",
  "candle",
  "chapel",
  "compass",
  "cross",
  "crown",
  "door",
  "dove",
  "flower",
  "fountain",
  "hands",
  "heart",
  "key",
  "lantern",
  "leaf",
  "links",
  "moon",
  "mountain",
  "open-book",
  "path",
  "people",
  "praying-hands",
  "scroll",
  "service-basket",
  "star",
  "sun",
  "tree",
  "wheat",
];

const candles = ["unlit", "small", "steady", "sparks", "halo"].map(
  (name) => `candle-${name}`
);
const mascots = [
  "mascot-lamb",
  "mascot-lantern",
  "mascot-scroll",
  "mascot-dove",
  "mascot-sprout",
  "mascot-key",
  "mascot-map",
  "mascot-campfire",
];
const trees = Array.from({ length: 20 }, (_, stage) => `tree-stage-${stage}`);

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

async function contactSheet({
  names,
  file,
  columns,
  background,
  foreground,
  iconSize,
  cellWidth = 176,
  cellHeight = 168,
}) {
  const rows = Math.ceil(names.length / columns);
  const composites = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const left = (index % columns) * cellWidth;
    const top = Math.floor(index / columns) * cellHeight;
    const icon = await sharp(path.join(spriteDir, `${name}.png`))
      .resize({
        width: iconSize,
        height: iconSize,
        fit: "contain",
        kernel: "nearest",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    composites.push({
      input: icon,
      left: left + Math.round((cellWidth - iconSize) / 2),
      top: top + 12,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="${cellWidth}" height="36" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="22" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" font-weight="700" fill="${foreground}">${escapeXml(name)}</text></svg>`
      ),
      left,
      top: top + cellHeight - 40,
    });
  }
  await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 4,
      background,
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outputDir, file));
}

await mkdir(outputDir, { recursive: true });
await contactSheet({
  names: small,
  file: "final-icons-preview.png",
  columns: 6,
  background: "#f6e9d1",
  foreground: "#173e2b",
  iconSize: 112,
});
await contactSheet({
  names: small,
  file: "final-icons-green-preview.png",
  columns: 6,
  background: "#173e2b",
  foreground: "#fff4de",
  iconSize: 112,
});
await contactSheet({
  names: small,
  file: "final-icons-charcoal-preview.png",
  columns: 6,
  background: "#2c2c2c",
  foreground: "#f6e9d1",
  iconSize: 112,
});
await contactSheet({
  names: trees,
  file: "final-tree-preview.png",
  columns: 5,
  background: "#f6e9d1",
  foreground: "#173e2b",
  iconSize: 128,
  cellWidth: 180,
  cellHeight: 184,
});
await contactSheet({
  names: mascots,
  file: "final-mascots-preview.png",
  columns: 4,
  background: "#f6e9d1",
  foreground: "#173e2b",
  iconSize: 144,
  cellWidth: 210,
  cellHeight: 204,
});
await contactSheet({
  names: candles,
  file: "final-candles-preview.png",
  columns: 5,
  background: "#f6e9d1",
  foreground: "#173e2b",
  iconSize: 126,
  cellWidth: 170,
  cellHeight: 178,
});

console.log(`Wrote production sprite previews to ${outputDir}`);
