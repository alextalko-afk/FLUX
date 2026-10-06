import { describe, it, expect, vi, afterEach } from 'vitest';
import { TranscribeService } from '../../../apps/server/src/translate/transcribe.service';

const voice = { id: 'm1', chatId: 'c1', type: 'VOICE', media: { fileObject: { id: 'f1', bucket: 'voice', key: 'a.ogg', mimeType: 'audio/ogg', size: 1000 } } };

const make = (config: Record<string, string | undefined>, message: any = voice) => {
  const cache = new Map<string, string>();
  const prisma = { message: { findFirst: vi.fn().mockResolvedValue(message) }, chatMember: { findFirst: vi.fn().mockResolvedValue({}) } };
  const redis = { get: async (k: string) => cache.get(k) ?? null, set: async (k: string, v: string) => void cache.set(k, v) };
  const s3 = { getObjectBuffer: vi.fn().mockResolvedValue(Buffer.from('audio')) };
  return new TranscribeService(prisma as any, redis as any, { get: (k: string) => config[k] } as any, s3 as any);
};

afterEach(() => vi.unstubAllGlobals());

describe('TranscribeService', () => {
  it('is disabled without TRANSCRIBE_URL', async () => {
    await expect(make({}).transcribe('u', 'm1')).rejects.toMatchObject({ response: { code: 'TRANSCRIBE_DISABLED' } });
  });

  it('refuses non-voice messages', async () => {
    const svc = make({ TRANSCRIBE_URL: 'http://t' }, { ...voice, type: 'TEXT' });
    await expect(svc.transcribe('u', 'm1')).rejects.toMatchObject({ response: { code: 'TRANSCRIBE_NOT_VOICE' } });
  });

  it('sends the audio once and caches the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'hello there' }) });
    vi.stubGlobal('fetch', fetchMock);
    const svc = make({ TRANSCRIBE_URL: 'http://t/v1/', TRANSCRIBE_API_KEY: 'k' });
    expect(await svc.transcribe('u', 'm1')).toEqual({ text: 'hello there', cached: false });
    expect((await svc.transcribe('u', 'm1')).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://t/v1/audio/transcriptions');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer k' });
  });
});
