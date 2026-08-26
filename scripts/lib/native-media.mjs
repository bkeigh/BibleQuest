import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const MEDIA_EXTENSION = /\.(?:gif|ico|jpe?g|png|svg|webp)$/i;

// These public files are referenced by native routes outside the 2.5D registry.
const NATIVE_PUBLIC_MEDIA = [
  "public/art/scripture-games-coming-2.webp",
  "public/art/scripture-games-today.webp",
  "public/art/seven-days-match-poster.webp",
  "public/brand/bq-logo.svg",
  "public/icons/apple-touch-icon.png",
  "public/icons/favicon-48.png",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/icon-maskable-512.png",
  "public/icons/icon.svg",
  "public/og.png",
  "public/wallpapers/01-let-there-be-light/poster.webp",
  "public/wallpapers/12-baptism-in-the-jordan/poster.webp",
  "public/wallpapers/20-empty-tomb-at-dawn/poster.webp",
  "public/wallpapers/galilee-be-still/poster.webp",
  "public/wallpapers/the-olive-grove/poster.webp",
  "public/wallpapers/the-sheltering-tree/poster.webp",
];

// Identifies image files that must be covered by the native rights inventory.
export function isPublicMediaPath(relativePath) {
  return relativePath.startsWith("public/") && MEDIA_EXTENSION.test(relativePath);
}

// Resolves the reviewed 2.5D manifest plus the finite native-route media list.
export function nativePublicMediaAllowlist(repositoryRoot) {
  const manifestPath = path.join(
    repositoryRoot,
    "public/art/2.5d/manifest.json",
  );
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error("the reviewed 2.5D media manifest is unreadable");
  }
  if (
    manifest?.schemaVersion !== 1 ||
    !Array.isArray(manifest.staticAssets) ||
    !Array.isArray(manifest.animations)
  ) {
    throw new Error("the reviewed 2.5D media manifest has an invalid contract");
  }

  const artFiles = [...manifest.staticAssets, ...manifest.animations].map(
    (file) => `public/art/2.5d/${file}`,
  );
  const files = [...new Set([...artFiles, ...NATIVE_PUBLIC_MEDIA])].sort();
  for (const file of files) {
    if (
      !isPublicMediaPath(file) ||
      file.includes("..") ||
      !existsSync(path.join(repositoryRoot, file))
    ) {
      throw new Error(`invalid or missing native public media: ${file}`);
    }
  }
  return files;
}
