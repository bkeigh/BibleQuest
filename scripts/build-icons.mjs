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
     <rect width="512" height="512" fill="#fefffc"/>
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

// A simple OG image on parchment
const og = Buffer.from(
  `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
     <rect width="1200" height="630" fill="#fefffc"/>
     <rect x="8" y="8" width="1184" height="614" fill="none" stroke="#dee2de" stroke-width="4"/>
     <image href="data:image/svg+xml;base64,${svg.toString("base64")}" x="470" y="70" width="260" height="260"/>
     <text x="600" y="410" text-anchor="middle" font-family="Georgia, serif" font-size="60" fill="#2c2c2c">BibleQuest</text>
     <text x="600" y="470" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#646464">One meaningful step with God today</text>
     <text x="600" y="540" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#6f8155">Scripture · Prayer · Reflection · Quests</text>
   </svg>`
);
await sharp(og).png().toFile(path.join(process.cwd(), "public", "og.png"));
console.log("✓ og.png");
