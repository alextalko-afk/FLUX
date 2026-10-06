import { describe, it, expect } from 'vitest';
import { contentMatchesType } from '../../../apps/server/src/media/content-sniff';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('upload content check', () => {
  it('accepts files whose start matches the declared type', () => {
    expect(contentMatchesType('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true);
    expect(contentMatchesType('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(contentMatchesType('application/pdf', text('%PDF-1.7'))).toBe(true);
    expect(contentMatchesType('audio/webm;codecs=opus', bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
    expect(contentMatchesType('text/plain', text('hello'))).toBe(true);
    expect(contentMatchesType('video/mp4', Uint8Array.from([0, 0, 0, 24, ...text('ftypisom')]))).toBe(true);
  });

  it('rejects a script or HTML sent as an image or document', () => {
    expect(contentMatchesType('image/png', text('<script>alert(1)</script>'))).toBe(false);
    expect(contentMatchesType('application/pdf', text('<html>'))).toBe(false);
    expect(contentMatchesType('image/gif', text('MZ'))).toBe(false);
  });

  it('rejects binary data declared as text, and unknown or SVG types', () => {
    expect(contentMatchesType('text/plain', bytes(0x4d, 0x5a, 0, 0))).toBe(false);
    expect(contentMatchesType('image/svg+xml', text('<svg onload=alert(1)>'))).toBe(false);
    expect(contentMatchesType('application/x-msdownload', text('MZ'))).toBe(false);
  });
});
