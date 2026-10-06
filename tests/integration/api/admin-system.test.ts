import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { API_URL, PASSWORD, TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://tguser:tgpass@localhost:5432/tglike?schema=public',
});

/** The scrape token the dev server was started with: read from the project's .env. */
function metricsToken(): string | undefined {
  if (process.env.METRICS_TOKEN) return process.env.METRICS_TOKEN;
  try {
    const env = readFileSync(resolve(__dirname, '../../../.env'), 'utf8');
    return /^METRICS_TOKEN="?([^"\r\n]+)"?/m.exec(env)?.[1];
  } catch {
    return undefined;
  }
}

describe('admin settings, queues and metrics', () => {
  let admin: TestUser;
  let user: TestUser;

  const setSettings = (patch: Record<string, unknown>) => api('PATCH', '/admin/settings', patch, admin.token);

  beforeAll(async () => {
    await resetRateLimits();
    admin = await createUser('as_a');
    user = await createUser('as_u');
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    // The role travels inside the access token, so sign in again after the promotion.
    const login = await api('POST', '/auth/login', { email: admin.email, password: PASSWORD });
    admin = { ...admin, token: login.json.accessToken };
  });

  afterAll(async () => {
    await setSettings({ registrationOpen: true, maintenanceMode: false, maintenanceMessage: '', maxUploadMb: 50 });
    await removeUser(admin);
    await removeUser(user);
    await prisma.$disconnect();
  });

  it('keeps the admin API for administrators', async () => {
    expect((await api('GET', '/admin/settings', undefined, user.token)).status).toBe(403);
    expect((await api('GET', '/admin/queues', undefined, user.token)).status).toBe(403);
    const res = await api('GET', '/admin/settings', undefined, admin.token);
    expect(res.status).toBe(200);
    expect(res.json.items.map((i: { key: string }) => i.key)).toEqual(
      expect.arrayContaining(['registrationOpen', 'maintenanceMode', 'maintenanceMessage', 'maxUploadMb']),
    );
  });

  it('validates setting values', async () => {
    expect((await setSettings({})).json.code).toBe('SETTING_EMPTY');
    expect((await setSettings({ nope: 1 })).json.code).toBe('SETTING_UNKNOWN');
    expect((await setSettings({ registrationOpen: 'yes' })).json.code).toBe('SETTING_INVALID');
    expect((await setSettings({ maxUploadMb: 0 })).json.code).toBe('SETTING_INVALID');
    expect((await setSettings({ maxUploadMb: 1.5 })).json.code).toBe('SETTING_INVALID');
    expect((await setSettings({ maintenanceMessage: 'x'.repeat(201) })).json.code).toBe('SETTING_INVALID');
  });

  it('can close registration', async () => {
    expect((await setSettings({ registrationOpen: false })).status).toBe(200);
    const res = await api('POST', '/auth/register', { email: `closed_${Date.now()}@example.com`, password: PASSWORD, firstName: 'No' });
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('REGISTRATION_CLOSED');
    await setSettings({ registrationOpen: true });
    const item = (await api('GET', '/admin/settings', undefined, admin.token)).json.items.find((i: { key: string }) => i.key === 'registrationOpen');
    expect(item.value).toBe(true);
  });

  it('applies the upload limit', async () => {
    await setSettings({ maxUploadMb: 1 });
    const big = await api('POST', '/media/upload/init', { fileName: 'a.png', mimeType: 'image/png', fileSize: String(2 * 1024 * 1024), mediaType: 'CHAT_MEDIA' }, user.token);
    expect(big.json.code).toBe('FILE_TOO_LARGE');
    expect(big.json.message).toContain('1MB');
    await setSettings({ maxUploadMb: 50 });
  });

  it('lets only administrators through in maintenance mode', async () => {
    await setSettings({ maintenanceMode: true, maintenanceMessage: 'Back in five minutes' });
    const blocked = await api('GET', '/chats', undefined, user.token);
    expect(blocked.status).toBe(503);
    expect(blocked.json).toMatchObject({ code: 'MAINTENANCE', message: 'Back in five minutes' });
    expect((await api('GET', '/chats', undefined, admin.token)).status).toBe(200);
    // Signing in and the health check stay available.
    expect((await api('GET', '/auth/me', undefined, user.token)).status).toBe(200);
    expect((await fetch(`${API_URL}/health`)).status).toBe(200);

    expect((await setSettings({ maintenanceMode: false })).status).toBe(200);
    expect((await api('GET', '/chats', undefined, user.token)).status).toBe(200);
  });

  it('shows queues and manages failed jobs', async () => {
    const res = await api('GET', '/admin/queues', undefined, admin.token);
    const names = res.json.items.map((q: { name: string }) => q.name);
    expect(names).toEqual(expect.arrayContaining(['push', 'bot-webhooks']));
    expect(res.json.items[0].counts).toEqual(expect.objectContaining({ waiting: expect.any(Number), failed: expect.any(Number) }));

    expect((await api('GET', '/admin/queues/push/failed', undefined, admin.token)).json.items).toEqual(expect.any(Array));
    expect((await api('GET', '/admin/queues/unknown/failed', undefined, admin.token)).json.code).toBe('QUEUE_UNKNOWN');
    expect((await api('POST', '/admin/queues/push/clean-failed', {}, admin.token)).json).toEqual({ removed: expect.any(Number) });
    expect((await api('POST', '/admin/queues/push/retry-failed', {}, admin.token)).json).toEqual({ retried: expect.any(Number) });
  });

  it('serves Prometheus metrics only with the token', async () => {
    const token = metricsToken();
    expect(token, 'METRICS_TOKEN must be set in .env for this test').toBeTruthy();
    expect((await fetch(`${API_URL}/metrics`)).status).toBe(401);
    expect((await fetch(`${API_URL}/metrics`, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);

    const res = await fetch(`${API_URL}/metrics`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('flux_http_requests_total');
    expect(text).toContain('flux_ws_connections');
    expect(text).toMatch(/flux_queue_jobs\{queue="push",state="waiting"\}/);
    // Labels are route patterns, never raw URLs with ids.
    expect(text).toContain('route="/api/v1/admin/queues/:name/failed"');
  });
});
