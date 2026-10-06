/**
 * Pure helpers for the FFmpeg adapter: which uploads are processed, how the
 * temporary input is named and how ffprobe's JSON is read. No Nest or
 * child-process imports, so the policy can be unit-tested without FFmpeg.
 */

export interface ProbeResult {
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Container extension per accepted type. Temporary files get a fixed name plus
 * this extension, never a name taken from the client.
 */
const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/x-m4a': 'm4a',
};

export function mediaExtension(mimeType: string): string | null {
  return EXTENSIONS[mimeType.toLowerCase()] ?? null;
}

export function isProbeable(mimeType: string): boolean {
  return mediaExtension(mimeType) !== null;
}

export function isPosterableVideo(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('video/') && isProbeable(mimeType);
}

const MAX_DURATION_SEC = 24 * 3600;

const finitePositive = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
};

/** Reads `ffprobe -print_format json -show_format -show_streams` output; garbage in, nulls out. */
export function parseProbeOutput(raw: string): ProbeResult {
  const empty: ProbeResult = { durationSec: null, width: null, height: null };
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!json || typeof json !== 'object') return empty;

  const streams: any[] = Array.isArray(json.streams) ? json.streams : [];
  const video = streams.find((s) => s?.codec_type === 'video' && finitePositive(s.width) && finitePositive(s.height));
  const duration = finitePositive(json.format?.duration) ?? finitePositive(streams.find((s) => finitePositive(s?.duration))?.duration);

  return {
    durationSec: duration !== null && duration <= MAX_DURATION_SEC ? Math.max(1, Math.round(duration)) : null,
    width: video ? Math.round(Number(video.width)) : null,
    height: video ? Math.round(Number(video.height)) : null,
  };
}
