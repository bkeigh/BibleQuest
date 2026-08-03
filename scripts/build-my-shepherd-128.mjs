/**
 * Draws the MyShepherd companion directly on a native 128x128 pixel grid.
 *
 * The generated concept is used only for art direction. This final sprite is
 * rebuilt from integer-coordinate masks with no resizing or resampling.
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SIZE = 128;
const CHANNELS = 4;
const OUTPUT =
  process.argv[2] ??
  "/Users/brendankenney/Pictures/Assets-BibleQuest/pixel/_review/my-shepherd-v1.png";

const COLORS = {
  outline: [44, 44, 44, 255],
  skinShadow: [138, 79, 50, 255],
  skin: [201, 130, 85, 255],
  skinLight: [240, 182, 129, 255],
  leatherDark: [76, 47, 29, 255],
  leather: [139, 94, 52, 255],
  greenDark: [23, 62, 43, 255],
  green: [31, 94, 58, 255],
  moss: [107, 143, 78, 255],
  blueDark: [24, 58, 85, 255],
  blue: [41, 84, 112, 255],
  blueLight: [93, 137, 163, 255],
  parchmentShadow: [213, 185, 130, 255],
  parchment: [246, 233, 209, 255],
  parchmentLight: [255, 244, 222, 255],
  gold: [212, 175, 55, 255],
};

/** Creates a blank one-byte logical mask. */
function makeMask() {
  return new Uint8Array(SIZE * SIZE);
}

/** Marks one logical pixel when it remains on the canvas. */
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

/** Fills a polygon into a mask without fractional coverage. */
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

/** Dilates a silhouette by a compact circular integer radius. */
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

/** Restricts a detail mask to an existing parent shape. */
function intersectMask(mask, parent) {
  const output = makeMask();
  for (let point = 0; point < mask.length; point += 1) {
    if (mask[point] && parent[point]) output[point] = 1;
  }
  return output;
}

/** Paints one solid palette color through a mask. */
function paintMask(pixels, mask, color) {
  for (let point = 0; point < mask.length; point += 1) {
    if (!mask[point]) continue;
    const offset = point * CHANNELS;
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      pixels[offset + channel] = color[channel];
    }
  }
}

/** Builds the complete MyShepherd sprite from deliberate pixel clusters. */
function buildMyShepherd() {
  const pixels = Buffer.alloc(SIZE * SIZE * CHANNELS);
  const silhouette = makeMask();
  const crook = makeMask();
  const cloak = makeMask();
  const robe = makeMask();
  const head = makeMask();
  const ears = makeMask();
  const neck = makeMask();
  const hair = makeMask();
  const leftSleeve = makeMask();
  const rightSleeve = makeMask();
  const leftHand = makeMask();
  const rightHand = makeMask();
  const bookLeft = makeMask();
  const bookRight = makeMask();
  const feet = makeMask();
  const sparkle = makeMask();

  drawLine(crook, 20, 27, 20, 115, 2);
  drawLine(crook, 20, 27, 20, 17, 2);
  drawLine(crook, 20, 17, 26, 10, 2);
  drawLine(crook, 26, 10, 35, 9, 2);
  drawLine(crook, 35, 9, 42, 15, 2);
  drawLine(crook, 42, 15, 42, 24, 2);
  drawLine(crook, 42, 24, 36, 30, 2);

  fillPolygon(cloak, [
    [45, 49],
    [57, 45],
    [77, 45],
    [91, 51],
    [101, 68],
    [103, 101],
    [94, 108],
    [83, 101],
    [78, 74],
    [50, 79],
    [40, 68],
  ]);
  fillPolygon(robe, [
    [46, 53],
    [76, 51],
    [86, 69],
    [88, 109],
    [81, 115],
    [42, 115],
    [36, 108],
    [39, 70],
  ]);

  fillEllipse(head, 62, 31, 16, 18, -0.04);
  fillEllipse(ears, 46, 32, 4, 6);
  fillEllipse(ears, 78, 32, 4, 6);
  fillRectangle(neck, 56, 43, 68, 54);

  fillEllipse(hair, 62, 18, 16, 10);
  fillEllipse(hair, 49, 25, 6, 12, -0.2);
  fillEllipse(hair, 76, 25, 6, 12, 0.2);
  fillEllipse(hair, 53, 15, 7, 6);
  fillEllipse(hair, 64, 12, 7, 6);
  fillEllipse(hair, 74, 16, 7, 7);
  fillPolygon(hair, [
    [48, 18],
    [77, 17],
    [75, 26],
    [69, 23],
    [65, 27],
    [60, 23],
    [55, 26],
    [49, 24],
  ]);

  fillPolygon(leftSleeve, [
    [43, 56],
    [50, 61],
    [42, 78],
    [31, 69],
    [29, 58],
    [35, 52],
  ]);
  fillEllipse(leftHand, 28, 61, 6, 8, -0.15);

  fillPolygon(rightSleeve, [
    [76, 54],
    [88, 58],
    [96, 69],
    [91, 79],
    [80, 72],
  ]);
  fillEllipse(rightHand, 94, 72, 8, 6, 0.2);

  fillPolygon(bookLeft, [
    [76, 51],
    [95, 47],
    [98, 73],
    [77, 77],
  ]);
  fillPolygon(bookRight, [
    [95, 47],
    [117, 54],
    [115, 78],
    [98, 73],
  ]);

  fillEllipse(feet, 49, 116, 12, 6, -0.08);
  fillEllipse(feet, 76, 116, 12, 6, 0.08);

  drawLine(sparkle, 108, 35, 108, 45, 0);
  drawLine(sparkle, 103, 40, 113, 40, 0);
  fillRectangle(sparkle, 106, 38, 110, 42);

  for (const mask of [
    crook,
    cloak,
    robe,
    head,
    ears,
    neck,
    hair,
    leftSleeve,
    rightSleeve,
    leftHand,
    rightHand,
    bookLeft,
    bookRight,
    feet,
    sparkle,
  ]) {
    unionMask(silhouette, mask);
  }

  paintMask(pixels, dilateMask(silhouette, 2), COLORS.outline);
  paintMask(pixels, cloak, COLORS.blue);
  paintMask(pixels, robe, COLORS.green);
  paintMask(pixels, neck, COLORS.skin);
  paintMask(pixels, ears, COLORS.skin);
  paintMask(pixels, head, COLORS.skin);
  paintMask(pixels, hair, COLORS.leatherDark);

  const hairLights = makeMask();
  drawLine(hairLights, 51, 17, 55, 13, 1);
  drawLine(hairLights, 60, 11, 65, 11, 1);
  drawLine(hairLights, 70, 14, 75, 18, 1);
  drawLine(hairLights, 48, 24, 49, 31, 0);
  paintMask(pixels, intersectMask(hairLights, hair), COLORS.leather);
  paintMask(pixels, leftSleeve, COLORS.green);
  paintMask(pixels, rightSleeve, COLORS.green);
  paintMask(pixels, leftHand, COLORS.skin);
  paintMask(pixels, rightHand, COLORS.skin);
  paintMask(pixels, crook, COLORS.leather);
  paintMask(pixels, feet, COLORS.leather);
  paintMask(pixels, bookLeft, COLORS.parchment);
  paintMask(pixels, bookRight, COLORS.parchmentLight);
  paintMask(pixels, sparkle, COLORS.gold);

  const robeShadow = makeMask();
  fillPolygon(robeShadow, [
    [37, 75],
    [49, 79],
    [52, 114],
    [42, 114],
    [36, 107],
  ]);
  fillPolygon(robeShadow, [
    [76, 64],
    [87, 73],
    [87, 110],
    [79, 114],
    [73, 83],
  ]);
  paintMask(pixels, intersectMask(robeShadow, robe), COLORS.greenDark);

  const robeLight = makeMask();
  fillPolygon(robeLight, [
    [53, 56],
    [63, 54],
    [65, 109],
    [56, 110],
  ]);
  paintMask(pixels, intersectMask(robeLight, robe), COLORS.moss);

  const cloakShadow = makeMask();
  fillPolygon(cloakShadow, [
    [84, 51],
    [101, 68],
    [103, 101],
    [95, 107],
    [88, 86],
  ]);
  fillPolygon(cloakShadow, [
    [40, 61],
    [51, 68],
    [49, 79],
    [41, 69],
  ]);
  paintMask(pixels, intersectMask(cloakShadow, cloak), COLORS.blueDark);

  const cloakLight = makeMask();
  drawLine(cloakLight, 56, 49, 49, 67, 1);
  drawLine(cloakLight, 73, 48, 89, 61, 1);
  drawLine(cloakLight, 91, 65, 96, 91, 1);
  paintMask(pixels, intersectMask(cloakLight, cloak), COLORS.blueLight);

  const faceLight = makeMask();
  fillEllipse(faceLight, 57, 27, 8, 12, -0.3);
  paintMask(pixels, intersectMask(faceLight, head), COLORS.skinLight);

  const faceShadow = makeMask();
  fillPolygon(faceShadow, [
    [70, 18],
    [79, 25],
    [76, 42],
    [66, 48],
    [68, 36],
  ]);
  paintMask(pixels, intersectMask(faceShadow, head), COLORS.skinShadow);

  const handLights = makeMask();
  drawLine(handLights, 25, 57, 25, 64, 0);
  drawLine(handLights, 91, 69, 98, 72, 0);
  paintMask(pixels, handLights, COLORS.skinLight);

  const crookLight = makeMask();
  drawLine(crookLight, 18, 29, 18, 111, 0);
  drawLine(crookLight, 22, 17, 27, 12, 0);
  drawLine(crookLight, 28, 11, 35, 11, 0);
  paintMask(pixels, intersectMask(crookLight, crook), COLORS.parchmentShadow);

  const bookShadow = makeMask();
  drawLine(bookShadow, 77, 75, 98, 71, 1);
  drawLine(bookShadow, 98, 71, 115, 76, 1);
  drawLine(bookShadow, 96, 49, 98, 72, 0);
  paintMask(pixels, bookShadow, COLORS.parchmentShadow);

  const pageLines = makeMask();
  for (const y of [55, 60, 65, 70]) {
    drawLine(pageLines, 82, y, 93, y - 2, 0);
    drawLine(pageLines, 101, y - 2, 112, y + 1, 0);
  }
  paintMask(pixels, pageLines, COLORS.leather);

  const belt = makeMask();
  drawLine(belt, 44, 76, 81, 76, 1);
  fillRectangle(belt, 60, 74, 65, 79);
  paintMask(pixels, intersectMask(belt, silhouette), COLORS.leather);
  const buckle = makeMask();
  fillRectangle(buckle, 61, 75, 64, 78);
  paintMask(pixels, buckle, COLORS.gold);

  const brooch = makeMask();
  fillEllipse(brooch, 48, 53, 4, 4);
  paintMask(pixels, brooch, COLORS.gold);
  const broochCenter = makeMask();
  fillRectangle(broochCenter, 47, 52, 49, 54);
  paintMask(pixels, broochCenter, COLORS.leather);

  const features = makeMask();
  fillRectangle(features, 55, 29, 57, 31);
  fillRectangle(features, 68, 29, 70, 31);
  drawLine(features, 55, 26, 58, 26, 0);
  drawLine(features, 67, 26, 71, 27, 0);
  drawLine(features, 58, 39, 66, 39, 0);
  paintMask(pixels, features, COLORS.outline);
  const nose = makeMask();
  drawLine(nose, 62, 31, 61, 36, 0);
  paintMask(pixels, nose, COLORS.skinShadow);

  const robeFolds = makeMask();
  drawLine(robeFolds, 48, 83, 47, 105, 0);
  drawLine(robeFolds, 69, 84, 70, 107, 0);
  drawLine(robeFolds, 80, 88, 82, 106, 0);
  paintMask(pixels, intersectMask(robeFolds, robe), COLORS.greenDark);

  const sandalLines = makeMask();
  drawLine(sandalLines, 41, 114, 55, 118, 1);
  drawLine(sandalLines, 68, 114, 82, 118, 1);
  paintMask(pixels, intersectMask(sandalLines, feet), COLORS.leatherDark);

  return pixels;
}

/** Writes and verifies the final native-grid PNG without resampling. */
async function main() {
  const pixels = buildMyShepherd();
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await sharp(pixels, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .png({ palette: true, colours: 16, dither: 0, effort: 10 })
    .toFile(OUTPUT);
  const metadata = await sharp(OUTPUT).metadata();
  if (metadata.width !== SIZE || metadata.height !== SIZE) {
    throw new Error(`Unexpected output size: ${metadata.width}x${metadata.height}`);
  }
  process.stdout.write(`${OUTPUT}\n`);
}

await main();
