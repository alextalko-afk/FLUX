/**
 * Pure helpers for the server-side image thumbnail pipeline.
 *
 * Kept free of Nest/Prisma/Sharp imports so the policy (which types get a
 * thumbnail, how the derived object is named) can be unit-tested without any
 * native image codecs or infrastructure.
 */

/** Longest edge of a generated thumbnail, in pixels. */
export const THUMBNAIL_MAX_DIMENSION = 480;

/** JPEG quality for generated thumbnails. */
export const THUMBNAIL_QUALITY = 78;

/**
 * Raster image types we can safely decode and re-encode with Sharp.
 *
 * SVG is excluded on purpose: it is a script-capable vector format, so
 * re-encoding it to a raster is a different (and riskier) concern. GIF is
 * excluded so we never silently flatten an animation to a single frame.
 */
const THUMBNAILABLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export function isThumbnailableImage(mimeType: string): boolean {
  return THUMBNAILABLE_IMAGE_TYPES.has(mimeType.toLowerCase());
}

/** Derives the thumbnail's object key from the original's key. */
export function thumbnailObjectKey(key: string): string {
  return `${key}.thumb.jpg`;
}
