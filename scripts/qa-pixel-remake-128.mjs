/**
 * Audits a remade BibleQuest sprite catalogue without mutating either tree.
 *
 * Usage:
 *   node scripts/qa-pixel-remake-128.mjs <source-dir> <candidate-dir> [report.json]
 */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SIZE = 128;
const MAX_OPAQUE_COLORS = 16;
const ASSET_PATTERN = /\.(?:png|gif)$/i;

/** Returns the SHA-256 digest for one file. */
async function fileHash(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

/** Lists only sprite assets at the root of a catalogue. */
async function listAssets(directory) {
  return (await readdir(directory))
    .filter((name) => ASSET_PATTERN.test(name))
    .sort();
}

/** Converts one RGBA pixel to a stable opaque color key. */
function colorKey(data, offset) {
  return `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
}

/** Counts visible four-connected components and isolated one-pixel islands. */
function componentStats(data, width, height) {
  const points = width * height;
  const visited = new Uint8Array(points);
  const sizes = [];
  for (let start = 0; start < points; start += 1) {
    if (visited[start] || data[start * 4 + 3] === 0) continue;
    const stack = [start];
    visited[start] = 1;
    let size = 0;
    while (stack.length > 0) {
      const point = stack.pop();
      size += 1;
      const x = point % width;
      const y = Math.floor(point / width);
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nextX, nextY] of neighbors) {
        if (
          nextX < 0 ||
          nextY < 0 ||
          nextX >= width ||
          nextY >= height
        ) {
          continue;
        }
        const next = nextY * width + nextX;
        if (!visited[next] && data[next * 4 + 3] !== 0) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    sizes.push(size);
  }
  return {
    components: sizes.length,
    onePixelIslands: sizes.filter((size) => size === 1).length,
  };
}

/** Measures approved black/charcoal coverage along each exterior boundary. */
function contourStats(data, width, height) {
  let boundary = 0;
  let approvedOutline = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = y * width + x;
      const offset = point * 4;
      if (data[offset + 3] === 0) continue;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      const isBoundary = neighbors.some(
        ([nextX, nextY]) =>
          nextX < 0 ||
          nextY < 0 ||
          nextX >= width ||
          nextY >= height ||
          data[(nextY * width + nextX) * 4 + 3] === 0
      );
      if (!isBoundary) continue;
      boundary += 1;
      const exactBlack =
        data[offset] === 0 &&
        data[offset + 1] === 0 &&
        data[offset + 2] === 0;
      const referenceCharcoal =
        data[offset] === 44 &&
        data[offset + 1] === 44 &&
        data[offset + 2] === 44;
      if (exactBlack || referenceCharcoal) {
        approvedOutline += 1;
      }
    }
  }
  return {
    boundaryPixels: boundary,
    approvedOutlineBoundaryPixels: approvedOutline,
    approvedOutlineCoverage:
      boundary === 0 ? 0 : approvedOutline / boundary,
  };
}

/** Audits every composited frame in one PNG or GIF. */
async function inspectAsset(file) {
  const image = sharp(file, { animated: true });
  const metadata = await image.metadata();
  const frameHeight = metadata.pageHeight ?? metadata.height;
  const frameCount = metadata.pages ?? 1;
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = new Set();
  const alphaValues = new Set();
  let borderOpaquePixels = 0;
  let visiblePixels = 0;
  const frameResults = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameData = Buffer.alloc(metadata.width * frameHeight * 4);
    for (let y = 0; y < frameHeight; y += 1) {
      const sourceStart = ((frame * frameHeight + y) * info.width) * 4;
      const targetStart = y * metadata.width * 4;
      data.copy(
        frameData,
        targetStart,
        sourceStart,
        sourceStart + metadata.width * 4
      );
    }
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < metadata.width; x += 1) {
        const offset = (y * metadata.width + x) * 4;
        const alpha = frameData[offset + 3];
        alphaValues.add(alpha);
        if (alpha === 0) continue;
        visiblePixels += 1;
        colors.add(colorKey(frameData, offset));
        if (
          x === 0 ||
          y === 0 ||
          x === metadata.width - 1 ||
          y === frameHeight - 1
        ) {
          borderOpaquePixels += 1;
        }
      }
    }
    frameResults.push({
      frame,
      ...componentStats(frameData, metadata.width, frameHeight),
      ...contourStats(frameData, metadata.width, frameHeight),
    });
  }

  return {
    format: metadata.format,
    width: metadata.width,
    height: frameHeight,
    frames: frameCount,
    delays: metadata.delay ?? [],
    loop: metadata.loop ?? null,
    colors: colors.size,
    alphaValues: [...alphaValues].sort((left, right) => left - right),
    borderOpaquePixels,
    visiblePixels,
    frameResults,
  };
}

/** Runs catalogue-level and per-asset policy checks. */
async function main() {
  const [sourceDirectory, candidateDirectory, reportPath] = process.argv.slice(2);
  if (!sourceDirectory || !candidateDirectory) {
    throw new Error(
      "Usage: node scripts/qa-pixel-remake-128.mjs <source-dir> <candidate-dir> [report.json]"
    );
  }

  const sourceAssets = await listAssets(sourceDirectory);
  const candidateAssets = await listAssets(candidateDirectory);
  const missing = sourceAssets.filter((name) => !candidateAssets.includes(name));
  const unexpected = candidateAssets.filter((name) => !sourceAssets.includes(name));
  const assets = {};
  const failures = [];
  const warnings = [];

  if (missing.length > 0) failures.push(`Missing: ${missing.join(", ")}`);
  if (unexpected.length > 0) failures.push(`Unexpected: ${unexpected.join(", ")}`);

  for (const name of sourceAssets.filter((asset) =>
    candidateAssets.includes(asset)
  )) {
    const candidate = path.join(candidateDirectory, name);
    const result = await inspectAsset(candidate);
    const sourceMetadata = await sharp(path.join(sourceDirectory, name), {
      animated: true,
    }).metadata();
    const sourceFrames = sourceMetadata.pages ?? 1;
    assets[name] = {
      ...result,
      sourceSha256: await fileHash(path.join(sourceDirectory, name)),
      candidateSha256: await fileHash(candidate),
    };

    if (assets[name].sourceSha256 === assets[name].candidateSha256) {
      failures.push(`${name}: byte-identical to source instead of a new remake`);
    }
    if (result.width !== SIZE || result.height !== SIZE) {
      failures.push(`${name}: ${result.width}x${result.height}, expected 128x128`);
    }
    if (result.frames !== sourceFrames) {
      failures.push(`${name}: ${result.frames} frames, source has ${sourceFrames}`);
    }
    if (
      name.toLowerCase().endsWith(".gif") &&
      JSON.stringify(result.delays) !== JSON.stringify(sourceMetadata.delay ?? [])
    ) {
      failures.push(`${name}: frame timing differs from source`);
    }
    if (
      name.toLowerCase().endsWith(".gif") &&
      result.loop !== (sourceMetadata.loop ?? null)
    ) {
      failures.push(`${name}: loop behavior differs from source`);
    }
    if (result.alphaValues.some((alpha) => alpha !== 0 && alpha !== 255)) {
      failures.push(`${name}: non-binary alpha (${result.alphaValues.join(",")})`);
    }
    if (result.borderOpaquePixels !== 0) {
      failures.push(`${name}: ${result.borderOpaquePixels} opaque border pixels`);
    }
    if (result.colors > MAX_OPAQUE_COLORS) {
      failures.push(
        `${name}: ${result.colors} opaque colors, cap is ${MAX_OPAQUE_COLORS}`
      );
    }
    const weakestContour = Math.min(
      ...result.frameResults.map((frame) => frame.approvedOutlineCoverage)
    );
    if (weakestContour < 0.7) {
      failures.push(
        `${name}: approved exterior contour coverage ${(weakestContour * 100).toFixed(1)}%`
      );
    }
    const isolated = result.frameResults.reduce(
      (sum, frame) => sum + frame.onePixelIslands,
      0
    );
    if (isolated > 0) {
      warnings.push(`${name}: ${isolated} isolated one-pixel island(s)`);
    }
  }

  const report = {
    policy: {
      size: `${SIZE}x${SIZE}`,
      binaryAlpha: true,
      transparentOuterBorder: true,
      maxOpaqueColors: MAX_OPAQUE_COLORS,
      approvedOutlineColors: ["#000000", "#2c2c2c"],
      minimumApprovedOutlineCoverage: 0.7,
    },
    summary: {
      sourceAssets: sourceAssets.length,
      candidateAssets: candidateAssets.length,
      passed: failures.length === 0,
      failures: failures.length,
      warnings: warnings.length,
    },
    missing,
    unexpected,
    failures,
    warnings,
    assets,
  };

  const output = JSON.stringify(report, null, 2);
  if (reportPath) await writeFile(reportPath, `${output}\n`);
  process.stdout.write(`${output}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
