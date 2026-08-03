/**
 * Reconstructs the complete BibleQuest pixel catalogue as review-only art.
 *
 * Originals are read from public/pixel and never modified. Every candidate is
 * authored directly on a 128x128 canvas with binary alpha, an eight-color cap,
 * deterministic color clusters, and an exact-black exterior contour. Major
 * silhouettes use two pixels; tiny accents use one so their color survives.
 *
 * Usage:
 *   node scripts/build-pixel-math-candidates.mjs <input-dir> <output-dir>
 */
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  buildReferenceDoveCandidate,
  REFERENCE_DOVE_PALETTE,
} from "./build-reference-dove-candidate.mjs";

const SIZE = 128;
const CHANNELS = 4;
const MAX_OPAQUE_COLORS = 8;
const OUTLINE_WIDTH = 2;
const MICRO_OUTLINE_WIDTH = 1;
const BLACK = [0, 0, 0, 255];
const PREVIEW_BACKGROUND = { r: 58, g: 83, b: 91, alpha: 1 };
const DOVE_GRID = 64;
const DOVE_SCALE = SIZE / DOVE_GRID;
const DOVE_PALETTE = [
  [0, 0, 0, 255],
  [255, 250, 228, 255],
  [248, 233, 188, 255],
  [232, 184, 86, 255],
  [232, 91, 17, 255],
  [66, 68, 7, 255],
  [116, 112, 9, 255],
  [164, 153, 16, 255],
];

const CANDLE_NAMES = [
  "candle-unlit",
  "candle-small",
  "candle-steady",
  "candle-sparks",
  "candle-halo",
];

const TREE_NAMES = Array.from(
  { length: 20 },
  (_, stage) => `tree-stage-${stage}`
);

const GIF_NAMES = [
  "mascot-lamb-walk.gif",
  "mascot-campfire-burn.gif",
];

/** Returns a stable SHA-256 fingerprint for one file. */
async function fileHash(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

/** Calculates one flat pixel offset on the native canvas. */
function pixelOffset(point) {
  return point * CHANNELS;
}

/** Sets one logical dove cell when it falls inside the authored canvas. */
function setDoveCell(mask, x, y) {
  if (x < 0 || y < 0 || x >= DOVE_GRID || y >= DOVE_GRID) return;
  mask[y * DOVE_GRID + x] = 1;
}

/** Fills one axis-aligned logical rectangle into a dove mask. */
function fillDoveRectangle(mask, left, top, right, bottom) {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) setDoveCell(mask, x, y);
  }
}

/** Fills one rotated ellipse as deliberate logical dove cells. */
function fillDoveEllipse(mask, centerX, centerY, radiusX, radiusY, angle = 0) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (let y = 0; y < DOVE_GRID; y += 1) {
    for (let x = 0; x < DOVE_GRID; x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      const localX = dx * cosine + dy * sine;
      const localY = -dx * sine + dy * cosine;
      if (
        (localX * localX) / (radiusX * radiusX) +
          (localY * localY) / (radiusY * radiusY) <=
        1
      ) {
        setDoveCell(mask, x, y);
      }
    }
  }
}

/** Reports whether one logical cell center lies inside a polygon. */
function dovePointInPolygon(x, y, points) {
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

/** Fills one logical polygon into a dove mask. */
function fillDovePolygon(mask, points) {
  for (let y = 0; y < DOVE_GRID; y += 1) {
    for (let x = 0; x < DOVE_GRID; x += 1) {
      if (dovePointInPolygon(x + 0.5, y + 0.5, points)) {
        setDoveCell(mask, x, y);
      }
    }
  }
}

/** Draws one connected logical line with a square pixel radius. */
function drawDoveLine(mask, startX, startY, endX, endY, radius = 0) {
  let x = startX;
  let y = startY;
  const dx = Math.abs(endX - startX);
  const sx = startX < endX ? 1 : -1;
  const dy = -Math.abs(endY - startY);
  const sy = startY < endY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    fillDoveRectangle(mask, x - radius, y - radius, x + radius, y + radius);
    if (x === endX && y === endY) break;
    const doubledError = 2 * error;
    if (doubledError >= dy) {
      error += dy;
      x += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** Unions one logical mask into another. */
function unionDoveMask(target, source) {
  for (let point = 0; point < target.length; point += 1) {
    if (source[point]) target[point] = 1;
  }
}

/** Dilates a logical mask by one square cell for a uniform final contour. */
function dilateDoveMask(mask) {
  const output = Uint8Array.from(mask);
  for (let y = 0; y < DOVE_GRID; y += 1) {
    for (let x = 0; x < DOVE_GRID; x += 1) {
      const point = y * DOVE_GRID + x;
      if (!mask[point]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          setDoveCell(output, x + dx, y + dy);
        }
      }
    }
  }
  return output;
}

/** Paints one logical color only where the complete dove silhouette exists. */
function paintDoveMask(indices, mask, silhouette, colorIndex) {
  for (let point = 0; point < indices.length; point += 1) {
    if (mask[point] && silhouette[point]) indices[point] = colorIndex;
  }
}

/** Retains the rejected geometric prototype for review provenance only. */
export function buildRejectedDovePrototype() {
  const body = new Uint8Array(DOVE_GRID * DOVE_GRID);
  const nearWing = new Uint8Array(body.length);
  const farWing = new Uint8Array(body.length);
  const tail = new Uint8Array(body.length);
  const beak = new Uint8Array(body.length);
  const feet = new Uint8Array(body.length);
  const branch = new Uint8Array(body.length);
  const leaves = new Uint8Array(body.length);
  const silhouette = new Uint8Array(body.length);

  fillDoveEllipse(body, 31, 38, 17, 10.5, -0.28);
  fillDoveEllipse(body, 39, 32, 10, 7, -0.35);
  fillDoveEllipse(body, 46, 27, 7.5, 6.5);

  fillDovePolygon(nearWing, [
    [32, 39],
    [27, 29],
    [23, 19],
    [20, 13],
    [17, 12],
    [18, 18],
    [15, 15],
    [12, 8],
    [9, 8],
    [10, 16],
    [13, 24],
    [17, 32],
    [23, 39],
  ]);
  fillDovePolygon(farWing, [
    [34, 39],
    [35, 28],
    [38, 17],
    [41, 11],
    [44, 12],
    [44, 20],
    [47, 18],
    [48, 22],
    [47, 31],
    [43, 40],
  ]);
  fillDovePolygon(tail, [
    [22, 41],
    [8, 49],
    [9, 53],
    [20, 49],
    [10, 56],
    [13, 59],
    [24, 51],
    [20, 59],
    [24, 60],
    [31, 47],
  ]);
  fillDovePolygon(beak, [
    [51, 26],
    [58, 29],
    [51, 31],
  ]);
  drawDoveLine(feet, 31, 46, 31, 47, 0);
  drawDoveLine(feet, 31, 47, 30, 48, 0);
  drawDoveLine(feet, 34, 46, 34, 47, 0);
  drawDoveLine(feet, 34, 47, 35, 48, 0);

  drawDoveLine(branch, 55, 29, 60, 23, 0);
  drawDoveLine(branch, 58, 26, 60, 28, 0);
  fillDoveEllipse(leaves, 56.5, 22, 2.5, 1.3, -0.7);
  fillDoveEllipse(leaves, 59.5, 20, 2.4, 1.3, 0.6);
  fillDoveEllipse(leaves, 59.5, 27, 2.5, 1.3, 0.3);

  for (const mask of [
    body,
    nearWing,
    farWing,
    tail,
    beak,
    feet,
    branch,
    leaves,
  ]) {
    unionDoveMask(silhouette, mask);
  }

  const outline = dilateDoveMask(silhouette);
  const indices = new Uint8Array(body.length);
  indices.fill(255);
  for (let point = 0; point < outline.length; point += 1) {
    if (outline[point]) indices[point] = 0;
    if (silhouette[point]) indices[point] = 1;
  }

  const bodyShadow = new Uint8Array(body.length);
  fillDoveEllipse(bodyShadow, 33, 42, 15, 7, -0.2);
  paintDoveMask(indices, bodyShadow, silhouette, 2);

  const bodyHighlight = new Uint8Array(body.length);
  fillDoveEllipse(bodyHighlight, 30, 36, 13, 6.5, -0.25);
  paintDoveMask(indices, bodyHighlight, silhouette, 1);

  const featherShadow = new Uint8Array(body.length);
  drawDoveLine(featherShadow, 12, 17, 25, 36, 0);
  drawDoveLine(featherShadow, 15, 24, 27, 38, 0);
  drawDoveLine(featherShadow, 19, 31, 29, 40, 0);
  drawDoveLine(featherShadow, 11, 52, 23, 47, 0);
  drawDoveLine(featherShadow, 14, 57, 26, 49, 0);
  drawDoveLine(featherShadow, 39, 19, 38, 33, 0);
  paintDoveMask(indices, featherShadow, silhouette, 3);

  const lightFeatherShadow = new Uint8Array(body.length);
  drawDoveLine(lightFeatherShadow, 13, 14, 25, 33, 0);
  drawDoveLine(lightFeatherShadow, 18, 25, 29, 38, 0);
  drawDoveLine(lightFeatherShadow, 12, 50, 24, 45, 0);
  paintDoveMask(indices, lightFeatherShadow, silhouette, 2);

  paintDoveMask(indices, beak, silhouette, 4);
  paintDoveMask(indices, feet, silhouette, 4);
  paintDoveMask(indices, branch, silhouette, 5);
  paintDoveMask(indices, leaves, silhouette, 6);

  const leafHighlights = new Uint8Array(body.length);
  setDoveCell(leafHighlights, 56, 21);
  setDoveCell(leafHighlights, 59, 20);
  setDoveCell(leafHighlights, 59, 27);
  paintDoveMask(indices, leafHighlights, silhouette, 7);

  const wingDivision = new Uint8Array(body.length);
  drawDoveLine(wingDivision, 33, 38, 37, 31, 0);
  paintDoveMask(indices, wingDivision, silhouette, 0);
  indices[26 * DOVE_GRID + 47] = 0;
  indices[26 * DOVE_GRID + 48] = 0;

  const output = Buffer.alloc(SIZE * SIZE * CHANNELS);
  for (let y = 0; y < DOVE_GRID; y += 1) {
    for (let x = 0; x < DOVE_GRID; x += 1) {
      const colorIndex = indices[y * DOVE_GRID + x];
      if (colorIndex === 255) continue;
      for (let dy = 0; dy < DOVE_SCALE; dy += 1) {
        for (let dx = 0; dx < DOVE_SCALE; dx += 1) {
          const physicalX = x * DOVE_SCALE + dx;
          const physicalY = y * DOVE_SCALE + dy;
          output.set(
            DOVE_PALETTE[colorIndex],
            pixelOffset(physicalY * SIZE + physicalX)
          );
        }
      }
    }
  }
  return output;
}

/** Identifies black and near-black source pixels used as contour guidance. */
function isNearBlack(buffer, point) {
  const offset = pixelOffset(point);
  return (
    buffer[offset] <= 32 &&
    buffer[offset + 1] <= 32 &&
    buffer[offset + 2] <= 32 &&
    buffer[offset + 3] !== 0
  );
}

/** Returns a squared RGB distance without introducing floating-point color. */
function colorDistance(left, right) {
  const red = left[0] - right[0];
  const green = left[1] - right[1];
  const blue = left[2] - right[2];
  return red * red + green * green + blue * blue;
}

/** Normalizes source alpha to the production binary-alpha contract. */
function binaryAlpha(buffer) {
  const output = Buffer.from(buffer);
  for (let offset = 0; offset < output.length; offset += CHANNELS) {
    if (output[offset + 3] < 128) {
      output.fill(0, offset, offset + CHANNELS);
    } else {
      output[offset + 3] = 255;
    }
  }
  return output;
}

/** Fills one-cell transparent pinholes surrounded on all four sides. */
function fillMaskPinholes(mask) {
  const output = Uint8Array.from(mask);
  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const point = y * SIZE + x;
      if (mask[point] !== 0) continue;
      if (
        mask[point - 1] &&
        mask[point + 1] &&
        mask[point - SIZE] &&
        mask[point + SIZE]
      ) {
        output[point] = 1;
      }
    }
  }
  return output;
}

/** Removes detached one-pixel alpha fragments but preserves real accents. */
function removeTinyMaskComponents(mask) {
  const output = Uint8Array.from(mask);
  const visited = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (visited[start] || mask[start] === 0) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % SIZE;
      const y = Math.floor(point / SIZE);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const next = ny * SIZE + nx;
          if (!visited[next] && mask[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (component.length >= 2) continue;
    for (const point of component) output[point] = 0;
  }
  return output;
}

/** Derives the cleaned opaque silhouette from normalized source pixels. */
function buildMask(buffer) {
  const mask = new Uint8Array(SIZE * SIZE);
  for (let point = 0; point < mask.length; point += 1) {
    mask[point] = buffer[pixelOffset(point) + 3] === 255 ? 1 : 0;
  }
  return removeTinyMaskComponents(fillMaskPinholes(mask));
}

/** Marks only transparent space connected to the canvas exterior. */
function exteriorTransparency(mask) {
  const exterior = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let point = 0; point < mask.length; point += 1) {
    const x = point % SIZE;
    const y = Math.floor(point / SIZE);
    if (
      mask[point] ||
      (x !== 0 && y !== 0 && x !== SIZE - 1 && y !== SIZE - 1)
    ) {
      continue;
    }
    exterior[point] = 1;
    queue[tail] = point;
    tail += 1;
  }
  while (head < tail) {
    const point = queue[head];
    head += 1;
    const x = point % SIZE;
    const y = Math.floor(point / SIZE);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const next = ny * SIZE + nx;
      if (!mask[next] && !exterior[next]) {
        exterior[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  }
  return exterior;
}

/** Finds Manhattan depth from opaque cells to exterior transparency only. */
function distanceFromTransparency(mask) {
  const distance = new Uint16Array(mask.length);
  distance.fill(65535);
  const exterior = exteriorTransparency(mask);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let point = 0; point < mask.length; point += 1) {
    if (!exterior[point]) continue;
    distance[point] = 0;
    queue[tail] = point;
    tail += 1;
  }
  while (head < tail) {
    const point = queue[head];
    head += 1;
    const x = point % SIZE;
    const y = Math.floor(point / SIZE);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const next = ny * SIZE + nx;
      if (!mask[next] && !exterior[next]) continue;
      if (distance[next] <= distance[point] + 1) continue;
      distance[next] = distance[point] + 1;
      queue[tail] = next;
      tail += 1;
    }
  }
  return distance;
}

/** Assigns a one-pixel contour only where a tiny accent cannot hold two. */
function componentOutlineWidths(mask, distance) {
  const widths = new Uint8Array(mask.length);
  widths.fill(OUTLINE_WIDTH);
  const visited = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (visited[start] || !mask[start]) continue;
    const component = [];
    const stack = [start];
    let maximumDepth = 0;
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      maximumDepth = Math.max(maximumDepth, distance[point]);
      const x = point % SIZE;
      const y = Math.floor(point / SIZE);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const next = ny * SIZE + nx;
          if (!visited[next] && mask[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (maximumDepth > OUTLINE_WIDTH) continue;
    for (const point of component) widths[point] = MICRO_OUTLINE_WIDTH;
  }
  return widths;
}

/** Collects weighted visible source colors while reserving black for contour. */
function collectColorEntries(buffers, masks) {
  const counts = new Map();
  for (let index = 0; index < buffers.length; index += 1) {
    const buffer = buffers[index];
    const mask = masks[index];
    for (let point = 0; point < mask.length; point += 1) {
      if (!mask[point] || isNearBlack(buffer, point)) continue;
      const offset = pixelOffset(point);
      const key = `${buffer[offset]},${buffer[offset + 1]},${buffer[offset + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([key, count]) => ({
    color: key.split(",").map(Number),
    count,
  }));
}

/** Selects source-faithful palette seeds with deterministic farthest sampling. */
function seedPalette(entries, maximum) {
  if (entries.length <= maximum) return entries.map(({ color }) => color);
  const ordered = [...entries].sort(
    (left, right) =>
      right.count - left.count ||
      left.color[0] - right.color[0] ||
      left.color[1] - right.color[1] ||
      left.color[2] - right.color[2]
  );
  const centers = [ordered[0].color];
  while (centers.length < maximum) {
    const next = ordered.reduce((best, entry) => {
      const nearest = Math.min(
        ...centers.map((center) => colorDistance(entry.color, center))
      );
      const score = nearest * Math.pow(entry.count, 0.35);
      return score > best.score ? { color: entry.color, score } : best;
    }, { color: ordered[0].color, score: -1 });
    centers.push(next.color);
  }
  return centers;
}

/** Refines palette seeds through weighted deterministic k-means iterations. */
function refinePalette(entries, initial) {
  let centers = initial.map((color) => [...color]);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const entry of entries) {
      let winner = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < centers.length; index += 1) {
        const distance = colorDistance(entry.color, centers[index]);
        if (distance < bestDistance) {
          bestDistance = distance;
          winner = index;
        }
      }
      sums[winner][0] += entry.color[0] * entry.count;
      sums[winner][1] += entry.color[1] * entry.count;
      sums[winner][2] += entry.color[2] * entry.count;
      sums[winner][3] += entry.count;
    }
    centers = centers.map((center, index) =>
      sums[index][3] === 0
        ? center
        : [
            Math.round(sums[index][0] / sums[index][3]),
            Math.round(sums[index][1] / sums[index][3]),
            Math.round(sums[index][2] / sums[index][3]),
          ]
    );
  }
  const unique = [];
  const seen = new Set();
  for (const center of centers) {
    const key = center.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(center);
  }
  return unique;
}

/** Builds one capped palette shared by every supplied animation frame. */
function buildPalette(buffers, masks) {
  const entries = collectColorEntries(buffers, masks);
  if (entries.length === 0) return [BLACK];
  const fills = refinePalette(
    entries,
    seedPalette(entries, MAX_OPAQUE_COLORS - 1)
  );
  return [BLACK, ...fills.map((color) => [...color, 255])];
}

/** Maps one visible nonblack source pixel to the nearest fill palette color. */
function nearestFillIndex(buffer, point, palette) {
  const offset = pixelOffset(point);
  const source = [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
  let winner = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < palette.length; index += 1) {
    const distance = colorDistance(source, palette[index]);
    if (distance < bestDistance) {
      bestDistance = distance;
      winner = index;
    }
  }
  return winner;
}

/** Preserves purposeful interior black clusters and removes black speckles. */
function internalBlackMask(buffer, mask, distance, outlineWidths) {
  const eligible = new Uint8Array(mask.length);
  for (let point = 0; point < mask.length; point += 1) {
    if (
      mask[point] &&
      distance[point] > outlineWidths[point] &&
      isNearBlack(buffer, point)
    ) {
      eligible[point] = 1;
    }
  }
  const preserve = new Uint8Array(mask.length);
  const visited = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (visited[start] || !eligible[start]) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % SIZE;
      const y = Math.floor(point / SIZE);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const next = ny * SIZE + nx;
          if (!visited[next] && eligible[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (component.length < 2) continue;
    for (const point of component) preserve[point] = 1;
  }
  return preserve;
}

/** Finds a nearby fill index when removing source outline noise from interiors. */
function nearbyFillIndex(indices, mask, x, y) {
  for (let radius = 1; radius <= 6; radius += 1) {
    const counts = new Map();
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const point = ny * SIZE + nx;
        const index = indices[point];
        if (!mask[point] || index <= 0) continue;
        counts.set(index, (counts.get(index) ?? 0) + 1);
      }
    }
    if (counts.size === 0) continue;
    return [...counts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0] - right[0]
    )[0][0];
  }
  return 1;
}

/** Merges isolated one-pixel fill colors into their dominant neighbor cluster. */
function mergeSingleColorCells(indices, mask) {
  const output = Uint8Array.from(indices);
  const visited = new Uint8Array(indices.length);
  for (let start = 0; start < indices.length; start += 1) {
    if (visited[start] || !mask[start] || indices[start] <= 0) continue;
    const target = indices[start];
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % SIZE;
      const y = Math.floor(point / SIZE);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const next = ny * SIZE + nx;
          if (!visited[next] && indices[next] === target) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (component.length >= 2) continue;
    const point = component[0];
    output[point] = nearbyFillIndex(
      indices,
      mask,
      point % SIZE,
      Math.floor(point / SIZE)
    );
  }
  return output;
}

/** Reconstructs one frame with a capped palette and exact two-pixel contour. */
function reconstructFrame(source, mask, palette) {
  const distance = distanceFromTransparency(mask);
  const outlineWidths = componentOutlineWidths(mask, distance);
  const preservedBlack = internalBlackMask(
    source,
    mask,
    distance,
    outlineWidths
  );
  const indices = new Uint8Array(mask.length);
  for (let point = 0; point < mask.length; point += 1) {
    if (!mask[point]) continue;
    if (
      distance[point] <= outlineWidths[point] ||
      preservedBlack[point] ||
      !isNearBlack(source, point)
    ) {
      indices[point] =
        distance[point] <= outlineWidths[point] || preservedBlack[point]
          ? 0
          : nearestFillIndex(source, point, palette);
    }
  }
  for (let point = 0; point < mask.length; point += 1) {
    if (
      mask[point] &&
      distance[point] > outlineWidths[point] &&
      indices[point] === 0 &&
      !preservedBlack[point]
    ) {
      indices[point] = nearbyFillIndex(
        indices,
        mask,
        point % SIZE,
        Math.floor(point / SIZE)
      );
    }
  }
  const cleanedIndices = mergeSingleColorCells(indices, mask);
  const output = Buffer.alloc(mask.length * CHANNELS);
  for (let point = 0; point < mask.length; point += 1) {
    if (!mask[point]) continue;
    output.set(palette[cleanedIndices[point]], pixelOffset(point));
  }
  return output;
}

/** Decodes one still PNG as normalized native RGBA. */
async function decodePng(file) {
  const decoded = await sharp(file)
    .resize(SIZE, SIZE, { fit: "fill", kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return binaryAlpha(decoded);
}

/** Writes one deterministic review PNG without altering its source file. */
async function reconstructPng(input, output, name) {
  const source = await decodePng(input);
  if (name === "dove") {
    const candidate = await buildReferenceDoveCandidate();
    const mask = buildMask(candidate);
    await sharp(candidate, {
      raw: { width: SIZE, height: SIZE, channels: CHANNELS },
    })
      .png({ compressionLevel: 9 })
      .toFile(output);
    return {
      source,
      candidate,
      mask,
      palette: REFERENCE_DOVE_PALETTE,
    };
  }
  const mask = buildMask(source);
  const palette = buildPalette([source], [mask]);
  const candidate = reconstructFrame(source, mask, palette);
  await sharp(candidate, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .png({ compressionLevel: 9 })
    .toFile(output);
  return { source, candidate, mask, palette };
}

/** Decodes every GIF frame into independent native RGBA buffers. */
async function decodeGif(file) {
  const metadata = await sharp(file, { animated: true }).metadata();
  const decoded = await sharp(file, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frameCount = metadata.pages ?? 1;
  const frameBytes = SIZE * SIZE * CHANNELS;
  const frames = Array.from({ length: frameCount }, (_, frame) =>
    binaryAlpha(
      decoded.data.subarray(frame * frameBytes, (frame + 1) * frameBytes)
    )
  );
  return { frames, metadata };
}

/** Encodes one little-endian GIF word. */
function gifWord(value) {
  return Buffer.from([value & 0xff, (value >>> 8) & 0xff]);
}

/** Encodes indexed pixels with the GIF variant of LZW compression. */
function encodeGifLzw(indices, minimumCodeSize) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const bytes = [];
  const codeSize = minimumCodeSize + 1;
  let bitBuffer = 0;
  let bitCount = 0;

  /** Appends one fixed-width LZW code in GIF's least-significant-bit order. */
  const writeCode = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  for (const symbol of indices) {
    writeCode(clearCode);
    writeCode(symbol);
  }
  writeCode(endCode);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);
  return Buffer.from(bytes);
}

/** Splits GIF image bytes into the required 255-byte data sub-blocks. */
function gifSubBlocks(data) {
  const blocks = [];
  for (let offset = 0; offset < data.length; offset += 255) {
    const block = data.subarray(offset, offset + 255);
    blocks.push(Buffer.from([block.length]), block);
  }
  blocks.push(Buffer.from([0]));
  return Buffer.concat(blocks);
}

/** Writes a fixed-palette GIF so exact black survives animation encoding. */
async function writeExactPaletteGif(
  output,
  frames,
  palette,
  delays,
  loop = 0
) {
  const visiblePalette = [[0, 0, 0], ...palette.map((color) => color.slice(0, 3))];
  let tableSize = 2;
  while (tableSize < visiblePalette.length) tableSize *= 2;
  const sizeBits = Math.log2(tableSize) - 1;
  const minimumCodeSize = Math.max(2, Math.log2(tableSize));
  const table = Buffer.alloc(tableSize * 3);
  visiblePalette.forEach((color, index) => {
    table.set(color, index * 3);
  });
  const paletteLookup = new Map(
    palette.map((color, index) => [color.slice(0, 3).join(","), index + 1])
  );
  const chunks = [
    Buffer.from("GIF89a", "ascii"),
    gifWord(SIZE),
    gifWord(SIZE),
    Buffer.from([0x80 | (7 << 4) | sizeBits, 0, 0]),
    table,
    Buffer.from([
      0x21,
      0xff,
      0x0b,
      ...Buffer.from("NETSCAPE2.0", "ascii"),
      0x03,
      0x01,
      loop & 0xff,
      (loop >>> 8) & 0xff,
      0,
    ]),
  ];
  for (let frame = 0; frame < frames.length; frame += 1) {
    const rgba = frames[frame];
    const indexed = new Uint8Array(SIZE * SIZE);
    for (let point = 0; point < indexed.length; point += 1) {
      const offset = pixelOffset(point);
      if (rgba[offset + 3] === 0) continue;
      const key = `${rgba[offset]},${rgba[offset + 1]},${rgba[offset + 2]}`;
      indexed[point] = paletteLookup.get(key);
    }
    const delay = Math.max(
      1,
      Math.round((delays?.[frame] ?? delays?.[0] ?? 150) / 10)
    );
    chunks.push(
      Buffer.from([0x21, 0xf9, 0x04, 0x09]),
      gifWord(delay),
      Buffer.from([0, 0]),
      Buffer.from([0x2c]),
      gifWord(0),
      gifWord(0),
      gifWord(SIZE),
      gifWord(SIZE),
      Buffer.from([0, minimumCodeSize]),
      gifSubBlocks(encodeGifLzw(indexed, minimumCodeSize))
    );
  }
  chunks.push(Buffer.from([0x3b]));
  await writeFile(output, Buffer.concat(chunks));
}

/** Reconstructs one GIF with a single palette shared across every frame. */
async function reconstructGif(input, output) {
  const { frames, metadata } = await decodeGif(input);
  const masks = frames.map(buildMask);
  const palette = buildPalette(frames, masks);
  const candidates = frames.map((frame, index) =>
    reconstructFrame(frame, masks[index], palette)
  );
  await writeExactPaletteGif(
    output,
    candidates,
    palette,
    metadata.delay,
    metadata.loop ?? 0
  );
  return { frames, candidates, masks, palette, metadata };
}

/** Escapes one label for safe inline SVG preview rendering. */
function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Creates one labeled original-versus-candidate comparison tile. */
async function comparisonTile(name, original, candidate) {
  const tileWidth = 320;
  const tileHeight = 178;
  const originalPng = await sharp(original, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .png()
    .toBuffer();
  const candidatePng = await sharp(candidate, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .png()
    .toBuffer();
  const label = Buffer.from(`
    <svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f3e7c9"/>
      <text x="12" y="20" fill="#173b32" font-family="monospace" font-size="13" font-weight="700">${escapeXml(name)}</text>
      <text x="44" y="39" fill="#4d5b54" font-family="sans-serif" font-size="10">ORIGINAL</text>
      <text x="202" y="39" fill="#4d5b54" font-family="sans-serif" font-size="10">MATH 128</text>
      <rect x="10" y="43" width="136" height="128" rx="3" fill="#3a535b"/>
      <rect x="174" y="43" width="136" height="128" rx="3" fill="#3a535b"/>
    </svg>
  `);
  return sharp(label)
    .composite([
      { input: originalPng, left: 14, top: 43 },
      { input: candidatePng, left: 178, top: 43 },
    ])
    .png()
    .toBuffer();
}

/** Arranges labeled comparison tiles into one review contact sheet. */
async function comparisonSheet(names, records, output, columns) {
  const tileWidth = 320;
  const tileHeight = 178;
  const rows = Math.ceil(names.length / columns);
  const canvas = sharp({
    create: {
      width: tileWidth * columns,
      height: tileHeight * rows,
      channels: 4,
      background: PREVIEW_BACKGROUND,
    },
  });
  const composites = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const record = records.get(name);
    if (!record) continue;
    composites.push({
      input: await comparisonTile(name, record.source, record.candidate),
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    });
  }
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(output);
}

/** Creates one enlarged tile for close inspection of mathematical contours. */
async function detailComparisonTile(name, original, candidate) {
  const tileWidth = 560;
  const tileHeight = 302;
  const originalPng = await sharp(original, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .resize(256, 256, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  const candidatePng = await sharp(candidate, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .resize(256, 256, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  const label = Buffer.from(`
    <svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f3e7c9"/>
      <text x="12" y="20" fill="#173b32" font-family="monospace" font-size="14" font-weight="700">${escapeXml(name)}</text>
      <text x="104" y="38" fill="#4d5b54" font-family="sans-serif" font-size="10">ORIGINAL · 2×</text>
      <text x="382" y="38" fill="#4d5b54" font-family="sans-serif" font-size="10">MATH 128 · 2×</text>
      <rect x="12" y="42" width="256" height="256" rx="3" fill="#3a535b"/>
      <rect x="292" y="42" width="256" height="256" rx="3" fill="#3a535b"/>
    </svg>
  `);
  return sharp(label)
    .composite([
      { input: originalPng, left: 12, top: 42 },
      { input: candidatePng, left: 292, top: 42 },
    ])
    .png()
    .toBuffer();
}

/** Builds an enlarged representative sheet for close approval review. */
async function detailComparisonSheet(names, records, output) {
  const columns = 2;
  const tileWidth = 560;
  const tileHeight = 302;
  const rows = Math.ceil(names.length / columns);
  const composites = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const record = records.get(name);
    if (!record) continue;
    composites.push({
      input: await detailComparisonTile(
        name,
        record.source,
        record.candidate
      ),
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    });
  }
  await sharp({
    create: {
      width: tileWidth * columns,
      height: tileHeight * rows,
      channels: 4,
      background: PREVIEW_BACKGROUND,
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(output);
}

/** Builds one original-versus-candidate sheet for every GIF frame. */
async function gifComparisonSheet(name, record, output) {
  const frameNames = record.frames.map(
    (_frame, index) => `${name} · frame ${index + 1}`
  );
  const frameRecords = new Map(
    frameNames.map((frameName, index) => [
      frameName,
      {
        source: record.frames[index],
        candidate: record.candidates[index],
      },
    ])
  );
  await comparisonSheet(frameNames, frameRecords, output, 3);
}

/** Measures the strict palette, alpha, padding, and contour candidate contract. */
async function qaPng(name, file) {
  const decoded = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = new Set();
  const alphaValues = new Set();
  const mask = new Uint8Array(SIZE * SIZE);
  let borderOpaque = 0;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const point = y * SIZE + x;
      const offset = pixelOffset(point);
      const alpha = decoded.data[offset + 3];
      alphaValues.add(alpha);
      if (alpha === 0) continue;
      mask[point] = 1;
      colors.add(
        `${decoded.data[offset]},${decoded.data[offset + 1]},${decoded.data[offset + 2]}`
      );
      if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) {
        borderOpaque += 1;
      }
    }
  }
  const distance = distanceFromTransparency(mask);
  const outlineWidths = componentOutlineWidths(mask, distance);
  let nonBlackOutline = 0;
  for (let point = 0; point < mask.length; point += 1) {
    if (!mask[point] || distance[point] > outlineWidths[point]) continue;
    const offset = pixelOffset(point);
    if (
      decoded.data[offset] !== 0 ||
      decoded.data[offset + 1] !== 0 ||
      decoded.data[offset + 2] !== 0
    ) {
      nonBlackOutline += 1;
    }
  }
  return {
    name,
    width: decoded.info.width,
    height: decoded.info.height,
    colors: colors.size,
    alphaValues: [...alphaValues].sort((left, right) => left - right),
    borderOpaque,
    nonBlackOutline,
    passed:
      decoded.info.width === SIZE &&
      decoded.info.height === SIZE &&
      colors.size <= MAX_OPAQUE_COLORS &&
      alphaValues.has(0) &&
      [...alphaValues].every((alpha) => alpha === 0 || alpha === 255) &&
      borderOpaque === 0 &&
      nonBlackOutline === 0,
  };
}

/** Measures the same strict contract across every reconstructed GIF frame. */
async function qaGif(name, file) {
  const metadata = await sharp(file, { animated: true }).metadata();
  const decoded = await sharp(file, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frameCount = metadata.pages ?? 1;
  const frameBytes = SIZE * SIZE * CHANNELS;
  const colors = new Set();
  const alphaValues = new Set();
  let borderOpaque = 0;
  let nonBlackOutline = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameStart = frame * frameBytes;
    const mask = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const point = y * SIZE + x;
        const offset = frameStart + pixelOffset(point);
        const alpha = decoded.data[offset + 3];
        alphaValues.add(alpha);
        if (alpha === 0) continue;
        mask[point] = 1;
        colors.add(
          `${decoded.data[offset]},${decoded.data[offset + 1]},${decoded.data[offset + 2]}`
        );
        if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) {
          borderOpaque += 1;
        }
      }
    }
    const distance = distanceFromTransparency(mask);
    const outlineWidths = componentOutlineWidths(mask, distance);
    for (let point = 0; point < mask.length; point += 1) {
      if (!mask[point] || distance[point] > outlineWidths[point]) continue;
      const offset = frameStart + pixelOffset(point);
      if (
        decoded.data[offset] !== 0 ||
        decoded.data[offset + 1] !== 0 ||
        decoded.data[offset + 2] !== 0
      ) {
        nonBlackOutline += 1;
      }
    }
  }
  return {
    name,
    width: metadata.width,
    height: metadata.pageHeight,
    frames: frameCount,
    delays: metadata.delay,
    colors: colors.size,
    alphaValues: [...alphaValues].sort((left, right) => left - right),
    borderOpaque,
    nonBlackOutline,
    passed:
      metadata.width === SIZE &&
      metadata.pageHeight === SIZE &&
      colors.size <= MAX_OPAQUE_COLORS &&
      alphaValues.has(0) &&
      [...alphaValues].every((alpha) => alpha === 0 || alpha === 255) &&
      borderOpaque === 0 &&
      nonBlackOutline === 0,
  };
}

/** Writes machine-readable and human-readable review QA summaries. */
async function writeQaReport(records, gifRecords, outputRoot) {
  const pngResults = [];
  for (const name of records.keys()) {
    pngResults.push(
      await qaPng(name, path.join(outputRoot, "candidates", `${name}.png`))
    );
  }
  const gifResults = [];
  for (const name of gifRecords.keys()) {
    gifResults.push(
      await qaGif(name, path.join(outputRoot, "animations", name))
    );
  }
  const passedPngs = pngResults.filter((result) => result.passed).length;
  const passedGifs = gifResults.filter((result) => result.passed).length;
  await writeFile(
    path.join(outputRoot, "qa-report.json"),
    `${JSON.stringify(
      {
        contract: {
          canvas: `${SIZE}x${SIZE}`,
          maximumOpaqueColors: MAX_OPAQUE_COLORS,
          alphaValues: [0, 255],
          outline: `${OUTLINE_WIDTH}px exact #000000 with ${MICRO_OUTLINE_WIDTH}px micro-accent exception`,
          originalsModified: false,
        },
        passedPngs,
        totalPngs: pngResults.length,
        passedGifs,
        totalGifs: gifResults.length,
        pngResults,
        gifResults,
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    path.join(outputRoot, "QA_REPORT.md"),
    `# Mathematical pixel candidate QA\n\n` +
      `- PNG candidates: ${passedPngs}/${pngResults.length} passed\n` +
      `- GIF candidates: ${passedGifs}/${gifResults.length} passed\n` +
      `- Canvas: ${SIZE}×${SIZE}\n` +
      `- Opaque colors: at most ${MAX_OPAQUE_COLORS}\n` +
      `- Alpha: binary only\n` +
      `- Exterior contour: ${OUTLINE_WIDTH}px exact black; ${MICRO_OUTLINE_WIDTH}px for components too small to retain a colored core\n` +
      `- Originals modified: no\n`
  );
}

/** Classifies all PNG names into focused approval sheets. */
function previewGroups(names) {
  const mascots = names.filter((name) => name.startsWith("mascot-"));
  if (names.includes("dove")) mascots.push("dove");
  const candles = names.filter((name) => CANDLE_NAMES.includes(name));
  const trees = names.filter((name) => TREE_NAMES.includes(name));
  const excluded = new Set([...mascots, ...candles, ...trees]);
  const icons = names.filter((name) => !excluded.has(name));
  return { icons, candles, trees, mascots };
}

/** Runs the non-destructive catalogue reconstruction and review build. */
async function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg || !outputArg) {
    throw new Error(
      "Usage: node scripts/build-pixel-math-candidates.mjs <input-dir> <output-dir>"
    );
  }
  const inputRoot = path.resolve(inputArg);
  const outputRoot = path.resolve(outputArg);
  if (
    inputRoot === outputRoot ||
    outputRoot.startsWith(`${inputRoot}${path.sep}`)
  ) {
    throw new Error("The candidate output must be separate from the originals");
  }
  await rm(outputRoot, { recursive: true, force: true });
  await Promise.all([
    mkdir(path.join(outputRoot, "candidates"), { recursive: true }),
    mkdir(path.join(outputRoot, "animations"), { recursive: true }),
    mkdir(path.join(outputRoot, "previews"), { recursive: true }),
  ]);

  const entries = await readdir(inputRoot);
  const pngFiles = entries.filter((file) => file.endsWith(".png")).sort();
  const records = new Map();
  const originalHashes = {};
  for (const file of pngFiles) {
    const name = file.slice(0, -4);
    const input = path.join(inputRoot, file);
    const output = path.join(outputRoot, "candidates", file);
    originalHashes[file] = await fileHash(input);
    records.set(name, await reconstructPng(input, output, name));
  }

  const gifRecords = new Map();
  for (const file of GIF_NAMES) {
    const input = path.join(inputRoot, file);
    const output = path.join(outputRoot, "animations", file);
    originalHashes[file] = await fileHash(input);
    gifRecords.set(file, await reconstructGif(input, output));
  }

  const groups = previewGroups([...records.keys()]);
  await comparisonSheet(
    groups.icons,
    records,
    path.join(outputRoot, "previews", "icons-comparison.png"),
    4
  );
  await comparisonSheet(
    groups.candles,
    records,
    path.join(outputRoot, "previews", "candles-comparison.png"),
    5
  );
  await comparisonSheet(
    groups.trees,
    records,
    path.join(outputRoot, "previews", "trees-comparison.png"),
    5
  );
  await comparisonSheet(
    groups.mascots,
    records,
    path.join(outputRoot, "previews", "mascots-comparison.png"),
    4
  );
  await detailComparisonSheet(
    [
      "dove",
      "chapel",
      "praying-hands",
      "tree-stage-16",
      "mascot-lamb",
      "mascot-campfire",
      "candle-halo",
      "key",
    ],
    records,
    path.join(outputRoot, "previews", "representative-detail-comparison.png")
  );
  for (const [file, record] of gifRecords) {
    await gifComparisonSheet(
      file.replace(".gif", ""),
      record,
      path.join(
        outputRoot,
        "previews",
        `${file.replace(".gif", "")}-frames-comparison.png`
      )
    );
  }

  await writeQaReport(records, gifRecords, outputRoot);
  const changedOriginals = [];
  for (const [file, expectedHash] of Object.entries(originalHashes)) {
    const currentHash = await fileHash(path.join(inputRoot, file));
    if (currentHash !== expectedHash) changedOriginals.push(file);
  }
  if (changedOriginals.length > 0) {
    throw new Error(
      `The non-destructive build changed originals: ${changedOriginals.join(", ")}`
    );
  }
  await writeFile(
    path.join(outputRoot, "original-sha256.json"),
    `${JSON.stringify(originalHashes, null, 2)}\n`
  );
  await writeFile(
    path.join(outputRoot, "README.md"),
    `# BibleQuest mathematical pixel-art candidates\n\n` +
      `These are review-only alternatives. Nothing in \`public/pixel/\` was changed.\n\n` +
      `## Contract\n\n` +
      `- Native 128×128 canvas with no final scaling\n` +
      `- At most eight opaque colors per asset\n` +
      `- Binary transparency only\n` +
      `- Exact-black two-pixel major contour\n` +
      `- Exact-black one-pixel contour only when an accent is too thin to retain a colored center\n` +
      `- No isolated one-pixel color noise\n` +
      `- One shared palette per GIF with original frame count and timing\n\n` +
      `Review \`previews/*-comparison.png\` before promoting any candidate.\n`
  );
  console.log(
    `Built ${pngFiles.length} PNG and ${gifRecords.size} GIF review candidates in ${outputRoot}`
  );
}

await main();
