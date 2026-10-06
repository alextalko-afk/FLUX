import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('stickers', () => {
  let owner: TestUser;
  let other: TestUser;
  let chat: string;

  const file = async (user: TestUser, mimeType = 'image/webp', fileSize = '2048') => {
    const res = await api('POST', '/media/upload/init', { fileName: 's.webp', mimeType, fileSize, mediaType: 'STICKER' }, user.token);
    expect(res.status).toBeLessThan(300);
    return (res.json.fileObjectId ?? res.json.id) as string;
  };

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('st_o');
    other = await createUser('st_x');
    chat = (await api('POST', '/chats/group', { title: 'G', memberIds: [other.id] }, owner.token)).json.id;
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(other);
  });

  it('rejects bad files and foreign files', async () => {
    const pdf = await file(owner, 'application/pdf');
    const big = await file(owner, 'image/png', String(600 * 1024));
    const foreign = await file(other);
    const make = (id: string) => api('POST', '/stickers/packs', { title: 'P', stickers: [{ fileObjectId: id, emoji: '😀' }] }, owner.token);
    expect((await make(pdf)).json.code).toBe('STICKER_BAD_FILE');
    expect((await make(big)).json.code).toBe('STICKER_BAD_FILE');
    expect((await make(foreign)).status).toBe(403);
  });

  it('accepts WebM clips and reports the file type so the client can loop them', async () => {
    const pack = await api('POST', '/stickers/packs', { title: 'Moving', stickers: [{ fileObjectId: await file(owner, 'video/webm'), emoji: '🎬' }] }, owner.token);
    expect(pack.status).toBe(201);
    expect(pack.json.stickers[0].mimeType).toBe('video/webm');
  });

  it('creates, installs, searches and sends a sticker', async () => {
    const pack = await api('POST', '/stickers/packs', { title: 'Cats pack', stickers: [{ fileObjectId: await file(owner), emoji: '🐱' }] }, owner.token);
    expect(pack.status).toBe(201);
    const sticker = pack.json.stickers[0];

    expect((await api('GET', '/stickers/packs/mine', undefined, owner.token)).json.items).toHaveLength(2);
    expect((await api('GET', '/stickers/packs?q=cats', undefined, other.token)).json.items.map((p: { id: string }) => p.id)).toContain(pack.json.id);
    expect((await api('POST', `/stickers/packs/${pack.json.id}/install`, {}, other.token)).status).toBe(200);
    expect((await api('GET', '/stickers/packs/mine', undefined, other.token)).json.items).toHaveLength(1);

    const sent = await api('POST', `/chats/${chat}/stickers`, { stickerId: sticker.id }, other.token);
    expect(sent.status).toBe(201);
    expect(sent.json.type).toBe('STICKER');
    expect(sent.json.sticker.emoji).toBe('🐱');

    const hist = await api('GET', `/chats/${chat}/messages`, undefined, owner.token);
    expect(hist.json.items.find((m: { type: string }) => m.type === 'STICKER').sticker.url).toContain('/media/download/');

    expect((await api('DELETE', `/stickers/packs/${pack.json.id}`, undefined, other.token)).status).toBe(403);
    expect((await api('DELETE', `/stickers/packs/${pack.json.id}/install`, undefined, other.token)).status).toBe(200);
    expect((await api('DELETE', `/stickers/packs/${pack.json.id}`, undefined, owner.token)).status).toBe(200);
  });

  it('returns 404 for an unknown sticker', async () => {
    const res = await api('POST', `/chats/${chat}/stickers`, { stickerId: '00000000-0000-4000-8000-000000000000' }, owner.token);
    expect(res.status).toBe(404);
  });
});
