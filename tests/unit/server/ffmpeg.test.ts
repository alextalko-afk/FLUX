import { describe, it, expect, vi } from 'vitest';
import { mediaExtension, isPosterableVideo, isProbeable, parseProbeOutput } from '../../../apps/server/src/media/media.probe';
import { FfmpegService, RunFn } from '../../../apps/server/src/media/ffmpeg.service';

const config = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key] }) as any;

/** An adapter whose binaries are replaced by `run`, the way the real ones would answer. */
async function adapter(run: RunFn, values: Record<string, string> = {}) {
  const service = new FfmpegService(config(values));
  (service as unknown as { run: RunFn }).run = run;
  await service.onModuleInit();
  return service;
}

describe('media probe helpers', () => {
  it('knows which types are processed and names temp files by type, never by the client', () => {
    expect(mediaExtension('video/mp4')).toBe('mp4');
    expect(mediaExtension('AUDIO/OGG')).toBe('ogg');
    expect(mediaExtension('application/pdf')).toBeNull();
    expect(isProbeable('audio/flac')).toBe(true);
    expect(isProbeable('image/png')).toBe(false);
    expect(isPosterableVideo('video/webm')).toBe(true);
    expect(isPosterableVideo('audio/webm')).toBe(false);
  });

  it('reads duration and frame size from ffprobe output', () => {
    const raw = JSON.stringify({
      streams: [{ codec_type: 'audio' }, { codec_type: 'video', width: 1920, height: 1080 }],
      format: { duration: '12.4' },
    });
    expect(parseProbeOutput(raw)).toEqual({ durationSec: 12, width: 1920, height: 1080 });
  });

  it('falls back to the stream duration, rounds up tiny clips and rejects nonsense', () => {
    expect(parseProbeOutput(JSON.stringify({ streams: [{ codec_type: 'audio', duration: '0.2' }], format: {} }))).toEqual({
      durationSec: 1,
      width: null,
      height: null,
    });
    expect(parseProbeOutput(JSON.stringify({ format: { duration: '999999999' } })).durationSec).toBeNull();
    expect(parseProbeOutput(JSON.stringify({ format: { duration: 'NaN' } })).durationSec).toBeNull();
    expect(parseProbeOutput('not json')).toEqual({ durationSec: null, width: null, height: null });
    expect(parseProbeOutput('null')).toEqual({ durationSec: null, width: null, height: null });
  });
});

describe('FfmpegService', () => {
  it('switches itself off when the binaries are missing', async () => {
    const service = await adapter(async () => {
      throw new Error('ENOENT');
    });
    expect(service.isEnabled()).toBe(false);
    expect(await service.probe(Buffer.from('x'), 'video/mp4')).toBeNull();
    expect(await service.videoPoster(Buffer.from('x'), 'video/mp4')).toBeNull();
  });

  it('probes with a locked-down command line and returns the parsed result', async () => {
    const run = vi.fn<Parameters<RunFn>, ReturnType<RunFn>>(async (_file, args) =>
      args[0] === '-version' ? 'ffprobe version' : JSON.stringify({ streams: [], format: { duration: '3' } }),
    );
    const service = await adapter(run, { FFPROBE_PATH: '/opt/ffprobe' });
    expect(await service.probe(Buffer.from('x'), 'video/mp4')).toEqual({ durationSec: 3, width: null, height: null });

    const call = run.mock.calls.find((c) => c[1].includes('-show_format'))!;
    expect(call[0]).toBe('/opt/ffprobe');
    expect(call[1]).toEqual(expect.arrayContaining(['-protocol_whitelist', 'file']));
    expect(call[1][call[1].length - 1]).toMatch(/input\.mp4$/);
    expect(call[2]).toBeGreaterThan(0);
  });

  it('does not touch unsupported types', async () => {
    const run = vi.fn<Parameters<RunFn>, ReturnType<RunFn>>(async () => 'ok');
    const service = await adapter(run);
    const before = run.mock.calls.length;
    expect(await service.probe(Buffer.from('x'), 'application/pdf')).toBeNull();
    expect(run.mock.calls.length).toBe(before);
  });

  it('retries the poster at the first frame for clips shorter than a second', async () => {
    const seeks: string[] = [];
    const service = await adapter(async (_file, args) => {
      if (args[0] === '-version') return 'ok';
      const seek = args[args.indexOf('-ss') + 1];
      seeks.push(seek);
      if (seek === '1') throw new Error('no frame');
      // Stand in for ffmpeg writing the poster next to the input.
      const { writeFileSync } = await import('node:fs');
      writeFileSync(args[args.length - 1], Buffer.from('JPEG'));
      return '';
    });
    const poster = await service.videoPoster(Buffer.from('x'), 'video/mp4');
    expect(poster?.toString()).toBe('JPEG');
    expect(seeks).toEqual(['1', '0']);
  });
});
