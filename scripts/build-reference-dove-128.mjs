/**
 * Draws a new dove directly on a 128x128 pixel grid from the approved
 * BibleQuest reference-sheet pose, palette, and 1-2px charcoal outline style.
 *
 * This is a fresh native-grid construction: no source raster is resized,
 * compressed, traced automatically, antialiased, or model-generated.
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SIZE = 128;
const CHANNELS = 4;
const OUTPUT =
  process.argv[2] ??
  "/Users/brendankenney/Pictures/Assets-BibleQuest/pixel/_review/dove-reference-v1.png";

const COLORS = {
  outline: [44, 44, 44, 255],
  parchment: [246, 233, 209, 255],
  highlight: [255, 247, 228, 255],
  warmLight: [237, 214, 169, 255],
  shadow: [213, 185, 130, 255],
  deepShadow: [185, 143, 78, 255],
  beak: [212, 127, 39, 255],
  beakLight: [239, 162, 57, 255],
  moss: [107, 143, 78, 255],
  mossDark: [57, 89, 47, 255],
  branch: [101, 69, 35, 255],
};

/** Creates a blank one-byte logical mask. */
function makeMask() {
  return new Uint8Array(SIZE * SIZE);
}

/** Marks one mask coordinate when it remains on the canvas. */
function setMask(mask, x, y) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  mask[y * SIZE + x] = 1;
}

/** Unions one logical mask into another. */
function unionMask(target, source) {
  for (let point = 0; point < target.length; point += 1) {
    if (source[point]) target[point] = 1;
  }
}

/** Fills an axis-aligned rectangle into a mask. */
function fillRectangle(mask, left, top, right, bottom) {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) setMask(mask, x, y);
  }
}

/** Fills a rotated ellipse using pixel-center sampling. */
function fillEllipse(mask, centerX, centerY, radiusX, radiusY, angle = 0) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const deltaX = x + 0.5 - centerX;
      const deltaY = y + 0.5 - centerY;
      const localX = deltaX * cosine + deltaY * sine;
      const localY = -deltaX * sine + deltaY * cosine;
      if (
        (localX * localX) / (radiusX * radiusX) +
          (localY * localY) / (radiusY * radiusY) <=
        1
      ) {
        setMask(mask, x, y);
      }
    }
  }
}

/** Reports whether one pixel center falls inside a polygon. */
function pointInPolygon(x, y, points) {
  let inside = false;
  for (
    let current = 0, previous = points.length - 1;
    current < points.length;
    previous = current, current += 1
  ) {
    const [currentX, currentY] = points[current];
    const [previousX, previousY] = points[previous];
    const intersects =
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) /
          (previousY - currentY) +
          currentX;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Fills a polygon into a mask with no fractional coverage. */
function fillPolygon(mask, points) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) setMask(mask, x, y);
    }
  }
}

/** Draws a connected integer-grid line with a square pixel radius. */
function drawLine(mask, startX, startY, endX, endY, radius = 0) {
  let x = startX;
  let y = startY;
  const deltaX = Math.abs(endX - startX);
  const stepX = startX < endX ? 1 : -1;
  const deltaY = -Math.abs(endY - startY);
  const stepY = startY < endY ? 1 : -1;
  let error = deltaX + deltaY;
  while (true) {
    fillRectangle(mask, x - radius, y - radius, x + radius, y + radius);
    if (x === endX && y === endY) break;
    const doubledError = error * 2;
    if (doubledError >= deltaY) {
      error += deltaY;
      x += stepX;
    }
    if (doubledError <= deltaX) {
      error += deltaX;
      y += stepY;
    }
  }
}

/** Dilates a silhouette by a circular integer radius for a compact outline. */
function dilateMask(mask, radius) {
  const output = makeMask();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!mask[y * SIZE + x]) continue;
      for (let deltaY = -radius; deltaY <= radius; deltaY += 1) {
        for (let deltaX = -radius; deltaX <= radius; deltaX += 1) {
          if (deltaX * deltaX + deltaY * deltaY <= radius * radius + 1) {
            setMask(output, x + deltaX, y + deltaY);
          }
        }
      }
    }
  }
  return output;
}

/** Paints one solid color through a mask. */
function paintMask(pixels, mask, color) {
  for (let point = 0; point < mask.length; point += 1) {
    if (!mask[point]) continue;
    const offset = point * CHANNELS;
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      pixels[offset + channel] = color[channel];
    }
  }
}

/** Restricts a detail mask to the complete visible subject. */
function intersectMask(mask, silhouette) {
  const output = makeMask();
  for (let point = 0; point < mask.length; point += 1) {
    if (mask[point] && silhouette[point]) output[point] = 1;
  }
  return output;
}

/** Repositions completed pixels by an integer offset without resampling. */
function translatePixels(pixels, offsetX, offsetY) {
  const output = Buffer.alloc(pixels.length);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (
        nextX < 0 ||
        nextY < 0 ||
        nextX >= SIZE ||
        nextY >= SIZE
      ) {
        continue;
      }
      const sourceOffset = (y * SIZE + x) * CHANNELS;
      const targetOffset = (nextY * SIZE + nextX) * CHANNELS;
      pixels.copy(
        output,
        targetOffset,
        sourceOffset,
        sourceOffset + CHANNELS
      );
    }
  }
  return output;
}

/** Builds the reference-sheet landing dove from deliberate pixel clusters. */
function buildDove() {
  const pixels = Buffer.alloc(SIZE * SIZE * CHANNELS);
  const body = makeMask();
  const head = makeMask();
  const neck = makeMask();
  const wing = makeMask();
  const tail = makeMask();
  const beak = makeMask();
  const legs = makeMask();
  const branch = makeMask();
  const leaves = makeMask();
  const silhouette = makeMask();

  fillEllipse(body, 61, 77, 27, 19, 0.18);
  fillEllipse(body, 51, 67, 15, 19, -0.28);
  fillEllipse(head, 35, 49, 14, 13, -0.08);
  fillPolygon(neck, [
    [36, 55],
    [49, 53],
    [64, 68],
    [58, 83],
    [43, 72],
  ]);

  fillPolygon(wing, [
    [57, 73],
    [60, 60],
    [67, 48],
    [76, 36],
    [87, 23],
    [98, 14],
    [102, 17],
    [101, 31],
    [106, 27],
    [108, 31],
    [106, 44],
    [102, 51],
    [106, 50],
    [105, 58],
    [99, 66],
    [95, 70],
    [100, 69],
    [96, 77],
    [87, 83],
    [74, 86],
    [64, 82],
  ]);

  fillPolygon(tail, [
    [74, 82],
    [91, 84],
    [108, 90],
    [111, 95],
    [107, 101],
    [99, 99],
    [106, 103],
    [107, 109],
    [102, 114],
    [94, 108],
    [95, 114],
    [91, 119],
    [85, 116],
    [72, 96],
  ]);

  fillPolygon(beak, [
    [24, 48],
    [16, 51],
    [24, 54],
    [28, 51],
  ]);

  drawLine(legs, 51, 91, 50, 102, 0);
  drawLine(legs, 63, 93, 62, 103, 0);
  drawLine(legs, 50, 102, 44, 105, 0);
  drawLine(legs, 50, 102, 55, 106, 0);
  drawLine(legs, 62, 103, 58, 107, 0);
  drawLine(legs, 62, 103, 68, 106, 0);

  drawLine(branch, 20, 51, 9, 39, 0);
  drawLine(branch, 14, 44, 8, 46, 0);
  drawLine(branch, 13, 43, 15, 34, 0);
  fillEllipse(leaves, 9, 36, 4, 2.5, -0.5);
  fillEllipse(leaves, 15, 33, 3, 5, -0.35);
  fillEllipse(leaves, 7, 45, 4, 2.5, 0.45);

  for (const mask of [
    body,
    head,
    neck,
    wing,
    tail,
    beak,
    legs,
    branch,
    leaves,
  ]) {
    unionMask(silhouette, mask);
  }

  const outline = dilateMask(silhouette, 1);
  paintMask(pixels, outline, COLORS.outline);
  paintMask(pixels, tail, COLORS.warmLight);
  paintMask(pixels, wing, COLORS.parchment);
  paintMask(pixels, neck, COLORS.parchment);
  paintMask(pixels, body, COLORS.parchment);
  paintMask(pixels, head, COLORS.highlight);
  paintMask(pixels, beak, COLORS.beak);
  paintMask(pixels, legs, COLORS.deepShadow);
  paintMask(pixels, branch, COLORS.branch);
  paintMask(pixels, leaves, COLORS.mossDark);

  const wingHighlight = makeMask();
  fillPolygon(wingHighlight, [
    [67, 59],
    [73, 47],
    [83, 35],
    [95, 22],
    [98, 22],
    [95, 42],
    [88, 56],
    [78, 69],
    [67, 77],
  ]);
  paintMask(
    pixels,
    intersectMask(wingHighlight, wing),
    COLORS.highlight
  );

  const wingShadow = makeMask();
  fillPolygon(wingShadow, [
    [64, 76],
    [75, 69],
    [97, 54],
    [103, 53],
    [97, 65],
    [86, 76],
    [73, 83],
  ]);
  paintMask(pixels, intersectMask(wingShadow, wing), COLORS.shadow);

  const bellyShadow = makeMask();
  fillEllipse(bellyShadow, 64, 91, 23, 5, 0.12);
  paintMask(pixels, intersectMask(bellyShadow, body), COLORS.shadow);

  const chestLight = makeMask();
  fillEllipse(chestLight, 47, 68, 10, 13, -0.3);
  paintMask(pixels, intersectMask(chestLight, body), COLORS.highlight);

  const tailShadow = makeMask();
  fillPolygon(tailShadow, [
    [76, 91],
    [105, 99],
    [106, 106],
    [101, 111],
    [94, 104],
    [94, 114],
    [89, 117],
  ]);
  paintMask(pixels, intersectMask(tailShadow, tail), COLORS.shadow);

  const internalLines = makeMask();
  drawLine(internalLines, 59, 74, 67, 58, 0);
  drawLine(internalLines, 67, 58, 78, 44, 0);
  drawLine(internalLines, 73, 66, 99, 47, 0);
  drawLine(internalLines, 76, 74, 98, 59, 0);
  drawLine(internalLines, 80, 81, 95, 71, 0);
  drawLine(internalLines, 76, 88, 105, 96, 0);
  drawLine(internalLines, 77, 94, 98, 107, 0);
  paintMask(
    pixels,
    intersectMask(internalLines, silhouette),
    COLORS.outline
  );

  const featherLights = makeMask();
  drawLine(featherLights, 79, 46, 94, 30, 0);
  drawLine(featherLights, 81, 60, 98, 48, 0);
  drawLine(featherLights, 85, 70, 98, 61, 0);
  drawLine(featherLights, 86, 91, 103, 96, 0);
  drawLine(featherLights, 83, 99, 96, 108, 0);
  paintMask(
    pixels,
    intersectMask(featherLights, silhouette),
    COLORS.highlight
  );

  const eye = makeMask();
  fillRectangle(eye, 31, 46, 33, 48);
  paintMask(pixels, eye, COLORS.outline);
  setMask(eye, 31, 46);
  const eyeGlint = makeMask();
  setMask(eyeGlint, 31, 46);
  paintMask(pixels, eyeGlint, COLORS.highlight);

  const beakLight = makeMask();
  fillPolygon(beakLight, [
    [22, 48],
    [17, 51],
    [24, 51],
  ]);
  paintMask(pixels, intersectMask(beakLight, beak), COLORS.beakLight);

  const leafLights = makeMask();
  drawLine(leafLights, 9, 33, 12, 34, 0);
  drawLine(leafLights, 15, 29, 17, 34, 0);
  drawLine(leafLights, 6, 44, 10, 45, 0);
  paintMask(
    pixels,
    intersectMask(leafLights, leaves),
    COLORS.moss
  );

  return translatePixels(pixels, 4, 0);
}

/** Writes and verifies the native-grid candidate without any resampling. */
async function main() {
  const pixels = buildDove();
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await sharp(pixels, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .png({ palette: true, colours: 12, dither: 0, effort: 10 })
    .toFile(OUTPUT);
  const metadata = await sharp(OUTPUT).metadata();
  if (metadata.width !== SIZE || metadata.height !== SIZE) {
    throw new Error(`Unexpected output size: ${metadata.width}x${metadata.height}`);
  }
  process.stdout.write(`${OUTPUT}\n`);
}

await main();
