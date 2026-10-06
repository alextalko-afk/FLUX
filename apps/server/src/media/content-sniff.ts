/**
 * Checks that an uploaded file really is what the client said it was.
 *
 * The declared MIME type is chosen by the uploader, so it proves nothing: a
 * script uploaded as `image/png` would otherwise be stored and later served
 * under that label. These are the leading bytes ("magic numbers") each format
 * must start with. Text formats must at least contain no binary bytes.
 */
const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const isFtyp = (b: Uint8Array) => startsWith(b, ascii('ftyp'), 4);
const isEbml = (b: Uint8Array) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]);
const isRiff = (b: Uint8Array, kind: string) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii(kind), 8);
const isAdtsOrMp3Frame = (b: Uint8Array) => b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
const isOle = (b: Uint8Array) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isZip = (b: Uint8Array) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);

function looksLikeText(bytes: Uint8Array): boolean {
  return bytes.length > 0 && !bytes.includes(0);
}

const CHECKS: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/jpg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a')),
  'image/webp': (b) => isRiff(b, 'WEBP'),
  'video/mp4': isFtyp,
  'video/quicktime': isFtyp,
  'video/webm': isEbml,
  'video/x-matroska': isEbml,
  'audio/mpeg': (b) => startsWith(b, ascii('ID3')) || isAdtsOrMp3Frame(b),
  'audio/mp3': (b) => startsWith(b, ascii('ID3')) || isAdtsOrMp3Frame(b),
  'audio/ogg': (b) => startsWith(b, ascii('OggS')),
  'audio/wav': (b) => isRiff(b, 'WAVE'),
  'audio/webm': isEbml,
  'audio/aac': (b) => isAdtsOrMp3Frame(b) || startsWith(b, ascii('ID3')),
  'audio/flac': (b) => startsWith(b, ascii('fLaC')),
  'audio/x-m4a': isFtyp,
  'application/pdf': (b) => startsWith(b, ascii('%PDF')),
  'application/zip': isZip,
  'application/x-rar-compressed': (b) => startsWith(b, ascii('Rar!')),
  'application/msword': isOle,
  'application/vnd.ms-excel': isOle,
  'application/vnd.ms-powerpoint': isOle,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': isZip,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': isZip,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': isZip,
  'text/plain': looksLikeText,
  'text/csv': looksLikeText,
  'application/json': looksLikeText,
};

/** True when the leading bytes fit the declared type. Unknown types never pass. */
export function contentMatchesType(declaredMime: string, head: Uint8Array): boolean {
  const base = declaredMime.split(';')[0].trim().toLowerCase();
  const check = CHECKS[base];
  return Boolean(check && check(head));
}
