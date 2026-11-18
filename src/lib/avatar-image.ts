/**
 * Avatar files are limited to safe raster formats and re-encoded in the browser
 * through a canvas before upload. Decoding to pixels and re-encoding discards
 * any embedded scripts (SVG), EXIF metadata or trailing payloads, so the bytes
 * stored in the public `avatars` bucket are always plain raster image data.
 * The storage RLS policies enforce the same extension/MIME whitelist server-side.
 */

export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_ACCEPT = ALLOWED_AVATAR_TYPES.join(",");

const MAX_DIMENSION = 512;

export function isAllowedAvatarType(type: string): boolean {
  return (ALLOWED_AVATAR_TYPES as readonly string[]).includes(type.toLowerCase());
}

export function extensionForType(type: string): string {
  return type.toLowerCase() === "image/png"
    ? "png"
    : type.toLowerCase() === "image/webp"
      ? "webp"
      : "jpg";
}

/** Decode + re-encode the picked file; throws when the bytes are not a real raster image. */
export async function reencodeAvatar(
  file: File,
  maxDimension = MAX_DIMENSION,
): Promise<{ blob: Blob; contentType: string }> {
  if (!isAllowedAvatarType(file.type)) throw new Error("Unsupported image type");

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file is not a valid image");
  });

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  // Keep transparency for PNG sources, otherwise use JPEG.
  const contentType = file.type.toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, contentType, 0.9),
  );
  if (!blob) throw new Error("Could not process that image");
  return { blob, contentType };
}
