import { describe, it, expect } from 'vitest';
import {
  THUMBNAIL_MAX_DIMENSION,
  THUMBNAIL_QUALITY,
  isThumbnailableImage,
  thumbnailObjectKey,
} from '../../../apps/server/src/media/media.thumbnail';

describe('media thumbnail policy', () => {
  it('thumbnails common raster image types', () => {
    expect(isThumbnailableImage('image/jpeg')).toBe(true);
    expect(isThumbnailableImage('image/jpg')).toBe(true);
    expect(isThumbnailableImage('image/png')).toBe(true);
    expect(isThumbnailableImage('image/webp')).toBe(true);
  });

  it('is case-insensitive and trims nothing but normalizes case', () => {
    expect(isThumbnailableImage('IMAGE/PNG')).toBe(true);
    expect(isThumbnailableImage('Image/Jpeg')).toBe(true);
  });

  it('never thumbnails svg (vector/script) or gif (would flatten animation)', () => {
    expect(isThumbnailableImage('image/svg+xml')).toBe(false);
    expect(isThumbnailableImage('image/gif')).toBe(false);
  });

  it('never thumbnails non-images', () => {
    expect(isThumbnailableImage('video/mp4')).toBe(false);
    expect(isThumbnailableImage('application/pdf')).toBe(false);
    expect(isThumbnailableImage('')).toBe(false);
  });

  it('derives a stable .thumb.jpg key from the source key', () => {
    expect(thumbnailObjectKey('chat_media/2026/10/01/abc.png')).toBe(
      'chat_media/2026/10/01/abc.png.thumb.jpg',
    );
  });

  it('exposes sane tuning constants', () => {
    expect(THUMBNAIL_MAX_DIMENSION).toBeGreaterThan(0);
    expect(THUMBNAIL_QUALITY).toBeGreaterThan(0);
    expect(THUMBNAIL_QUALITY).toBeLessThanOrEqual(100);
  });
});
