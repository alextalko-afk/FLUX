import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://tguser:tgpass@localhost:5432/tglike?schema=public',
});

describe('stories', () => {
  let author: TestUser;
  let friend: TestUser;
  let stranger: TestUser;

  const file = async (user: TestUser, mimeType = 'image/png') => {
    const res = await api('POST', '/media/upload/init', { fileName: 's.png', mimeType, fileSize: '2048', mediaType: 'CHAT_MEDIA' }, user.token);
    expect(res.status).toBeLessThan(300);
    return (res.json.fileObjectId ?? res.json.id) as string;
  };

  beforeAll(async () => {
    await resetRateLimits();
    author = await createUser('sy_a');
    friend = await createUser('sy_f');
    stranger = await createUser('sy_s');
    expect((await api('POST', '/contacts', { targetId: friend.id }, author.token)).status).toBeLessThan(300);
  });

  afterAll(async () => {
    await prisma.story.deleteMany({ where: { authorId: author.id } });
    await prisma.$disconnect();
    await removeUser(author);
    await removeUser(friend);
    await removeUser(stranger);
  });

  it('rejects other files and foreign files', async () => {
    const pdf = await file(author, 'application/pdf');
    expect((await api('POST', '/stories', { fileObjectId: pdf }, author.token)).json.code).toBe('STORY_BAD_FILE');
    const theirs = await file(stranger);
    expect((await api('POST', '/stories', { fileObjectId: theirs }, author.token)).status).toBe(404);
  });

  let storyId: string;

  it('shows a story to contacts only, and tracks views', async () => {
    const res = await api('POST', '/stories', { fileObjectId: await file(author), caption: 'hello' }, author.token);
    expect(res.status).toBe(201);
    storyId = res.json.id;
    expect(new Date(res.json.expiresAt).getTime() - Date.now()).toBeGreaterThan(23 * 3600 * 1000);

    const feed = await api('GET', '/stories', undefined, friend.token);
    expect(feed.json.items).toHaveLength(1);
    expect(feed.json.items[0]).toMatchObject({ hasUnseen: true });
    expect(feed.json.items[0].author.id).toBe(author.id);
    expect((await api('GET', '/stories', undefined, stranger.token)).json.items).toHaveLength(0);

    expect((await api('POST', `/stories/${storyId}/view`, {}, stranger.token)).status).toBe(404);
    expect((await api('POST', `/stories/${storyId}/view`, {}, friend.token)).status).toBe(200);
    expect((await api('GET', '/stories', undefined, friend.token)).json.items[0].hasUnseen).toBe(false);
  });

  it('shows viewers only to the author', async () => {
    expect((await api('GET', `/stories/${storyId}/viewers`, undefined, friend.token)).status).toBe(403);
    const res = await api('GET', `/stories/${storyId}/viewers`, undefined, author.token);
    expect(res.json.total).toBe(1);
    expect(res.json.items[0].user.id).toBe(friend.id);
  });

  it('hides stories from blocked users, and from everyone after expiry or deletion', async () => {
    expect((await api('POST', `/users/${friend.id}/block`, {}, author.token)).status).toBeLessThan(300);
    expect((await api('GET', '/stories', undefined, friend.token)).json.items).toHaveLength(0);
    expect((await api('DELETE', `/users/${friend.id}/block`, undefined, author.token)).status).toBeLessThan(300);
    // Blocking also removes the contact, so it has to be added again.
    await api('POST', '/contacts', { targetId: friend.id }, author.token);
    expect((await api('GET', '/stories', undefined, friend.token)).json.items).toHaveLength(1);

    await prisma.story.update({ where: { id: storyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api('GET', '/stories', undefined, friend.token)).json.items).toHaveLength(0);

    const again = (await api('POST', '/stories', { fileObjectId: await file(author) }, author.token)).json.id;
    expect((await api('DELETE', `/stories/${again}`, undefined, friend.token)).status).toBe(404);
    expect((await api('DELETE', `/stories/${again}`, undefined, author.token)).status).toBe(200);
  });
});
