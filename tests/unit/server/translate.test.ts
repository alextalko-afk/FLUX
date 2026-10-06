import { describe, it, expect, vi, afterEach } from 'vitest';
import { TranslateService } from '../../../apps/server/src/translate/translate.service';

const make = (config: Record<string, string | undefined>, message: any = { id: 'm1', chatId: 'c1', content: 'Hello', isDeleted: false }) => {
  const cache = new Map<string, string>();
  const prisma = {
    message: { findFirst: vi.fn().mockResolvedValue(message) },
    chatMember: { findFirst: vi.fn().mockResolvedValue({ id: 'x' }) },
    chat: { findUnique: vi.fn().mockResolvedValue({ type: 'GROUP' }) },
  };
  const redis = { get: async (k: string) => cache.get(k) ?? null, set: async (k: string, v: string) => void cache.set(k, v) };
  const service = new TranslateService(prisma as any, redis as any, { get: (k: string) => config[k] } as any);
  return { service, prisma };
};

afterEach(() => vi.unstubAllGlobals());

describe('TranslateService', () => {
  it('is disabled without TRANSLATE_URL', async () => {
    await expect(make({}).service.translate('u', 'm1', 'ru')).rejects.toMatchObject({ response: { code: 'TRANSLATE_DISABLED' } });
  });

  it('calls the provider once and serves repeats from the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ translatedText: 'Привет', detectedLanguage: { language: 'en' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const { service } = make({ TRANSLATE_URL: 'http://tr:5000/' });
    expect(await service.translate('u', 'm1', 'ru')).toEqual({ text: 'Привет', target: 'ru', detected: 'en', cached: false });
    expect((await service.translate('u', 'm1', 'ru')).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://tr:5000/translate');
  });

  it('reports provider failures and refuses empty text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(make({ TRANSLATE_URL: 'http://tr' }).service.translate('u', 'm1', 'ru')).rejects.toMatchObject({ response: { code: 'TRANSLATE_UNAVAILABLE' } });
    const empty = make({ TRANSLATE_URL: 'http://tr' }, { id: 'm1', chatId: 'c1', content: '  ', isDeleted: false });
    await expect(empty.service.translate('u', 'm1', 'ru')).rejects.toMatchObject({ response: { code: 'TRANSLATE_EMPTY' } });
  });
});
