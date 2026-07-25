import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  InvalidAvatarImageError,
  normalizeAvatarImage,
} from "@/lib/avatar/image.server";
import {
  avatarContainerHasExactEnd,
  avatarMimeFromSignature,
  isSafeAvatarMarker,
  MAX_AVATAR_OUTPUT_BYTES,
  validateAvatarFile,
} from "@/lib/avatar/validation";

let png: Buffer;
let jpeg: Buffer;
let webp: Buffer;

/** Creates real decoder fixtures so tests cover signatures and raster parsing. */
beforeAll(async () => {
  const source = sharp({
    create: {
      width: 640,
      height: 320,
      channels: 3,
      background: { r: 22, g: 91, b: 67 },
    },
  });
  [png, jpeg, webp] = await Promise.all([
    source.clone().png().toBuffer(),
    source.clone().jpeg().toBuffer(),
    source.clone().webp().toBuffer(),
  ]);
});

describe("profile avatar validation", () => {
  it("recognizes the three allowed raster containers and their exact ends", () => {
    expect(avatarMimeFromSignature(png)).toBe("image/png");
    expect(avatarMimeFromSignature(jpeg)).toBe("image/jpeg");
    expect(avatarMimeFromSignature(webp)).toBe("image/webp");
    expect(avatarContainerHasExactEnd(png, "image/png")).toBe(true);
    expect(avatarContainerHasExactEnd(jpeg, "image/jpeg")).toBe(true);
    expect(avatarContainerHasExactEnd(webp, "image/webp")).toBe(true);
  });

  it("rejects MIME confusion and appended-data polyglots before upload", async () => {
    const appended = Buffer.concat([png, Buffer.from("<script>")]);
    const fakePngEnd = Buffer.concat([
      png,
      Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]),
    ]);
    const fakeJpegEnd = Buffer.concat([jpeg, Buffer.from([0xff, 0xd9])]);
    expect(
      await validateAvatarFile(
        new Blob([Uint8Array.from(png).buffer], { type: "image/jpeg" }),
      ),
    ).toBe(false);
    expect(
      await validateAvatarFile(
        new Blob([Uint8Array.from(appended).buffer], { type: "image/png" }),
      ),
    ).toBe(false);
    expect(
      await validateAvatarFile(
        new Blob([Uint8Array.from(fakePngEnd).buffer], { type: "image/png" }),
      ),
    ).toBe(false);
    expect(
      await validateAvatarFile(
        new Blob([Uint8Array.from(fakeJpegEnd).buffer], {
          type: "image/jpeg",
        }),
      ),
    ).toBe(false);
  });

  it("normalizes accepted input to one bounded square WebP", async () => {
    const output = await normalizeAvatarImage(
      Uint8Array.from(png).buffer,
      "image/png",
    );
    const metadata = await sharp(output).metadata();

    expect(output.byteLength).toBeLessThanOrEqual(MAX_AVATAR_OUTPUT_BYTES);
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects appended bytes, a false MIME claim, and tiny source images", async () => {
    const appended = Buffer.concat([jpeg, Buffer.from([0])]);
    const tiny = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: "white",
      },
    })
      .png()
      .toBuffer();

    await expect(
      normalizeAvatarImage(
        Uint8Array.from(appended).buffer,
        "image/jpeg",
      ),
    ).rejects.toBeInstanceOf(InvalidAvatarImageError);
    await expect(
      normalizeAvatarImage(Uint8Array.from(webp).buffer, "image/png"),
    ).rejects.toBeInstanceOf(InvalidAvatarImageError);
    await expect(
      normalizeAvatarImage(Uint8Array.from(tiny).buffer, "image/png"),
    ).rejects.toBeInstanceOf(InvalidAvatarImageError);
  });

  it("accepts only bounded UUID or legacy ISO cache markers", () => {
    expect(
      isSafeAvatarMarker("00000000-0000-4000-8000-000000000001"),
    ).toBe(true);
    expect(isSafeAvatarMarker("2026-07-24T12:00:00.000Z")).toBe(true);
    expect(isSafeAvatarMarker("../private.webp")).toBe(false);
    expect(isSafeAvatarMarker("not-a-version")).toBe(false);
  });
});
