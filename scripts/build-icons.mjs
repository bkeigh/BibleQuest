/**
 * Build every icon surface from one source of truth: the -Cross brand art
 * (assets/BQ-Logo-Vector-Cross.svg — book + single gold cross).
 * Composes public/icons/icon.svg, rasterizes the PWA + Apple PNG set,
 * writes src/app/favicon.ico, and renders the OG image.
 * A maskable variant keeps the art inside the safe zone on Android.
 * Run: node scripts/build-icons.mjs
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "icons");

// Source art — the book-and-cross mark that every surface derives from.
const art = await readFile(
  path.join(process.cwd(), "assets", "BQ-Logo-Vector-Cross.svg"),
  "utf8"
);
const viewBox = art.match(/viewBox="([^"]+)"/)[1];
const artInner = art.slice(
  art.indexOf(">", art.indexOf("<svg")) + 1,
  art.lastIndexOf("</svg>")
);

// App icon: the art nested on a rounded parchment tile.
const iconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="parch" cx="50%" cy="36%" r="72%">
      <stop offset="0%" stop-color="#f9efd8"/>
      <stop offset="100%" stop-color="#efe1bd"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#parch)"/>
  <svg x="118" y="80" width="277" height="352" viewBox="${viewBox}">${artInner}</svg>
</svg>
`;
await writeFile(path.join(dir, "icon.svg"), iconSvg);
console.log("✓ icon.svg");

const svg = Buffer.from(iconSvg);

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

// Apple touch icon: iOS replaces transparency with BLACK and applies its own
// squircle mask, so ship it flattened onto parchment — no alpha at all.
await sharp(svg, { density: 384 })
  .resize(180, 180)
  .flatten({ background: "#f4e8c9" })
  .png()
  .toFile(path.join(dir, "apple-touch-icon.png"));
console.log("✓ apple-touch-icon.png");

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

// favicon.ico — the App Router serves src/app/favicon.ico at /favicon.ico for
// anything that hardcodes the classic path (crawlers, bookmarks, old browsers).
const icoPngs = await Promise.all(
  [16, 32, 48].map((size) =>
    sharp(svg, { density: 256 }).resize(size, size).png().toBuffer()
  )
);
await writeFile(
  path.join(process.cwd(), "src", "app", "favicon.ico"),
  await pngToIco(icoPngs)
);
console.log("✓ favicon.ico");

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
