/**
 * Rasterize the app icon SVG into the PNGs the PWA manifest + Apple need.
 * A maskable variant keeps the tree inside the safe zone on Android.
 * Run: node scripts/build-icons.mjs
 */
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "icons");
const svg = await readFile(path.join(dir, "icon.svg"));

async function png(size, name) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(dir, name));
  console.log(`✓ ${name}`);
}

// Standard icons
await png(192, "icon-192.png");
await png(512, "icon-512.png");
await png(180, "apple-touch-icon.png");

// Maskable: same art on a full-bleed parchment square with padding so it
// survives Android's circular/rounded masks.
const maskableSvg = Buffer.from(
  `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
     <rect width="512" height="512" fill="#f4e8c9"/>
     <image href="data:image/svg+xml;base64,${svg.toString("base64")}"
            x="72" y="72" width="368" height="368"/>
   </svg>`
);
await sharp(maskableSvg, { density: 384 })
  .resize(512, 512)
  .png()
  .toFile(path.join(dir, "icon-maskable-512.png"));
console.log("✓ icon-maskable-512.png");

// Favicon
await sharp(svg, { density: 256 }).resize(48, 48).png().toFile(path.join(dir, "favicon-48.png"));
console.log("✓ favicon-48.png");

// OG image — deep Bible-cover green, gold rule, the mark + wordmark in cream
const logo = await readFile(
  path.join(process.cwd(), "public", "brand", "bq-logo.svg")
);
const og = Buffer.from(
  `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
     <rect width="1200" height="630" fill="#0e533c"/>
     <rect x="14" y="14" width="1172" height="602" fill="none" stroke="#d3a336" stroke-width="3" rx="18"/>
     <image href="data:image/svg+xml;base64,${logo.toString("base64")}" x="497" y="88" width="206" height="262"/>
     <text x="600" y="452" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#faf6ec">BibleQuest</text>
     <text x="600" y="520" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#e7c563">Scripture, prayer, and real-life quests — one step a day</text>
   </svg>`
);
await sharp(og).png().toFile(path.join(process.cwd(), "public", "og.png"));
console.log("✓ og.png");
