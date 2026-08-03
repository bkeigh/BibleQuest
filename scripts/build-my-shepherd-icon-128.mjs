/**
 * Builds the MyShepherd UI emblem directly on a native 128x128 pixel grid.
 * Every edge is an integer-coordinate mask with binary transparency.
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SIZE = 128;
const CHANNELS = 4;
const OUTPUT =
  process.argv[2] ??
  "/Users/brendankenney/Pictures/Assets-BibleQuest/pixel/my-shepherd-icon.png";

const COLORS = {
  outline: [44, 44, 44, 255],
  blueDark: [24, 58, 85, 255],
  blue: [41, 84, 112, 255],
  blueLight: [93, 137, 163, 255],
  greenDark: [23, 62, 43, 255],
  green: [31, 94, 58, 255],
  moss: [107, 143, 78, 255],
  goldDark: [143, 101, 26, 255],
  gold: [212, 175, 55, 255],
  goldLight: [245, 212, 106, 255],
  leather: [139, 94, 52, 255],
  parchmentShadow: [213, 185, 130, 255],
  parchment: [246, 233, 209, 255],
  parchmentLight: [255, 244, 222, 255],
};

/** Creates a blank logical-pixel mask. */
function makeMask() {
  return new Uint8Array(SIZE * SIZE);
}

/** Sets one pixel without leaving the canvas. */
function setPixel(mask, x, y) {
  if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) mask[y * SIZE + x] = 1;
}

/** Fills a rectangle using inclusive integer coordinates. */
function fillRectangle(mask, left, top, right, bottom) {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) setPixel(mask, x, y);
  }
}

/** Fills an ellipse using hard pixel-center membership. */
function fillEllipse(mask, centerX, centerY, radiusX, radiusY) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (x + 0.5 - centerX) / radiusX;
      const dy = (y + 0.5 - centerY) / radiusY;
      if (dx * dx + dy * dy <= 1) setPixel(mask, x, y);
    }
  }
}

/** Determines whether a pixel center is inside a polygon. */
function pointInPolygon(x, y, points) {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
    const [cx, cy] = points[current];
    const [px, py] = points[previous];
    const crosses = cy > y !== py > y && x < ((px - cx) * (y - cy)) / (py - cy) + cx;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Fills a polygon with binary pixel coverage. */
function fillPolygon(mask, points) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) setPixel(mask, x, y);
    }
  }
}

/** Draws a connected square-pixel line using Bresenham stepping. */
function drawLine(mask, startX, startY, endX, endY, radius = 0) {
  let x = startX;
  let y = startY;
  const dx = Math.abs(endX - startX);
  const sx = startX < endX ? 1 : -1;
  const dy = -Math.abs(endY - startY);
  const sy = startY < endY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    fillRectangle(mask, x - radius, y - radius, x + radius, y + radius);
    if (x === endX && y === endY) break;
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** Expands a mask by an integer pixel radius for consistent outlines. */
function dilate(mask, radius) {
  const expanded = makeMask();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!mask[y * SIZE + x]) continue;
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          if (ox * ox + oy * oy <= radius * radius + 1) setPixel(expanded, x + ox, y + oy);
        }
      }
    }
  }
  return expanded;
}

/** Keeps only pixels shared with a parent shape. */
function intersect(mask, parent) {
  const result = makeMask();
  for (let point = 0; point < mask.length; point += 1) {
    if (mask[point] && parent[point]) result[point] = 1;
  }
  return result;
}

/** Paints one opaque palette color through a mask. */
function paint(pixels, mask, color) {
  for (let point = 0; point < mask.length; point += 1) {
    if (!mask[point]) continue;
    const offset = point * CHANNELS;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
}

/** Builds the complete badge from a few readable symbolic layers. */
function buildIcon() {
  const pixels = Buffer.alloc(SIZE * SIZE * CHANNELS);

  const badge = makeMask();
  fillEllipse(badge, 64, 63, 51, 51);
  paint(pixels, dilate(badge, 2), COLORS.outline);
  paint(pixels, badge, COLORS.blue);

  const badgeShadow = makeMask();
  fillPolygon(badgeShadow, [[18, 68], [111, 68], [111, 99], [94, 113], [64, 117], [33, 110], [18, 91]]);
  paint(pixels, intersect(badgeShadow, badge), COLORS.blueDark);

  const badgeLight = makeMask();
  drawLine(badgeLight, 27, 54, 34, 35, 2);
  drawLine(badgeLight, 34, 35, 51, 22, 2);
  drawLine(badgeLight, 51, 22, 70, 19, 2);
  paint(pixels, intersect(badgeLight, badge), COLORS.blueLight);

  const innerRing = makeMask();
  fillEllipse(innerRing, 64, 63, 43, 43);
  const innerDisk = makeMask();
  fillEllipse(innerDisk, 64, 63, 40, 40);
  paint(pixels, innerRing, COLORS.blueDark);
  paint(pixels, innerDisk, COLORS.blue);

  const crook = makeMask();
  drawLine(crook, 61, 82, 61, 43, 2);
  drawLine(crook, 61, 43, 60, 34, 2);
  drawLine(crook, 60, 34, 55, 28, 2);
  drawLine(crook, 55, 28, 48, 26, 2);
  drawLine(crook, 48, 26, 42, 29, 2);
  drawLine(crook, 42, 29, 39, 35, 2);
  drawLine(crook, 39, 35, 40, 42, 2);
  drawLine(crook, 40, 42, 45, 47, 2);
  drawLine(crook, 45, 47, 51, 48, 2);
  paint(pixels, dilate(crook, 2), COLORS.outline);
  paint(pixels, crook, COLORS.goldDark);

  const crookLight = makeMask();
  drawLine(crookLight, 59, 79, 59, 43, 0);
  drawLine(crookLight, 58, 35, 54, 30, 0);
  drawLine(crookLight, 53, 29, 48, 28, 0);
  drawLine(crookLight, 47, 28, 43, 31, 0);
  paint(pixels, intersect(crookLight, crook), COLORS.goldLight);

  const cover = makeMask();
  fillPolygon(cover, [[30, 70], [49, 67], [64, 73], [79, 67], [98, 70], [96, 101], [76, 99], [64, 104], [52, 99], [32, 101]]);
  paint(pixels, dilate(cover, 2), COLORS.outline);
  paint(pixels, cover, COLORS.greenDark);

  const coverLight = makeMask();
  fillRectangle(coverLight, 34, 72, 37, 94);
  fillRectangle(coverLight, 91, 72, 94, 94);
  paint(pixels, intersect(coverLight, cover), COLORS.moss);

  const leftPage = makeMask();
  fillPolygon(leftPage, [[35, 67], [48, 64], [56, 66], [64, 71], [64, 97], [55, 93], [47, 91], [35, 94]]);
  const rightPage = makeMask();
  fillPolygon(rightPage, [[64, 71], [72, 66], [80, 64], [93, 67], [93, 94], [81, 91], [73, 93], [64, 97]]);
  paint(pixels, dilate(leftPage, 2), COLORS.outline);
  paint(pixels, dilate(rightPage, 2), COLORS.outline);
  paint(pixels, leftPage, COLORS.parchment);
  paint(pixels, rightPage, COLORS.parchmentLight);

  const pageShadow = makeMask();
  fillPolygon(pageShadow, [[35, 87], [48, 85], [64, 91], [64, 97], [55, 93], [47, 91], [35, 94]]);
  fillPolygon(pageShadow, [[64, 91], [80, 85], [93, 87], [93, 94], [81, 91], [73, 93], [64, 97]]);
  paint(pixels, pageShadow, COLORS.parchmentShadow);

  const gutter = makeMask();
  drawLine(gutter, 64, 72, 64, 96, 1);
  paint(pixels, gutter, COLORS.leather);

  const writing = makeMask();
  drawLine(writing, 41, 73, 55, 72, 0);
  drawLine(writing, 40, 78, 56, 77, 0);
  drawLine(writing, 40, 83, 54, 82, 0);
  drawLine(writing, 73, 72, 87, 73, 0);
  drawLine(writing, 72, 77, 88, 78, 0);
  drawLine(writing, 74, 82, 88, 83, 0);
  paint(pixels, writing, COLORS.leather);

  const sparkle = makeMask();
  fillRectangle(sparkle, 91, 31, 93, 47);
  fillRectangle(sparkle, 84, 38, 100, 40);
  fillRectangle(sparkle, 88, 35, 96, 43);
  paint(pixels, dilate(sparkle, 1), COLORS.outline);
  paint(pixels, sparkle, COLORS.gold);
  fillRectangle(sparkle, 91, 37, 93, 41);
  paint(pixels, sparkle, COLORS.goldLight);

  return pixels;
}

await mkdir(path.dirname(OUTPUT), { recursive: true });
await sharp(buildIcon(), { raw: { width: SIZE, height: SIZE, channels: CHANNELS } })
  .png({ palette: true, colors: 16, dither: 0 })
  .toFile(OUTPUT);

console.log(OUTPUT);
