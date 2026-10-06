import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { MobilePushService, DeviceTarget } from '../../../apps/server/src/notifications/mobile-push.service';

const config = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key] }) as any;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function service(values: Record<string, string>, fetchFn: (...args: any[]) => Promise<Response>) {
  const s = new MobilePushService(config(values));
  (s as unknown as { fetchFn: typeof fetchFn }).fetchFn = fetchFn;
  return s;
}

const expoTarget = (n: number): DeviceTarget => ({ id: `e${n}`, provider: 'expo', token: `ExponentPushToken[abc${n}]` });

describe('Expo delivery', () => {
  it('posts one batch, counts accepted tickets and reports dead tokens', async () => {
    const fetchFn = vi.fn(async (_url: string, init: any) => {
      expect(JSON.parse(init.body).map((m: any) => m.to)).toEqual(['ExponentPushToken[abc1]', 'ExponentPushToken[abc2]']);
      return json({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] });
    });
    const result = await service({}, fetchFn).send([expoTarget(1), expoTarget(2)], { title: 'Anna', body: 'Hi', data: { chatId: 'c1' } });
    expect(result).toEqual({ sent: 1, invalidIds: ['e2'] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe('https://exp.host/--/api/v2/push/send');
  });

  it('splits more than 100 devices into several requests and sends the access token when set', async () => {
    const fetchFn = vi.fn(async (_url: string, init: any) => json({ data: JSON.parse(init.body).map(() => ({ status: 'ok' })) }));
    const targets = Array.from({ length: 150 }, (_, i) => expoTarget(i));
    const result = await service({ EXPO_ACCESS_TOKEN: 'secret' }, fetchFn).send(targets, { title: 't', body: 'b' });
    expect(result.sent).toBe(150);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect((fetchFn.mock.calls[0][1] as any).headers.authorization).toBe('Bearer secret');
  });

  it('survives a provider outage without throwing', async () => {
    const result = await service({}, async () => json({}, 503)).send([expoTarget(1)], { title: 't', body: 'b' });
    expect(result).toEqual({ sent: 0, invalidIds: [] });
  });
});

describe('FCM delivery', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const account = JSON.stringify({ client_email: 'push@demo.iam.gserviceaccount.com', private_key: privateKey, project_id: 'demo' });
  const target = (id: string): DeviceTarget => ({ id, provider: 'fcm', token: `fcm-token-${id}-xxxxxxxxxxxxxxxx` });

  it('does nothing without a service account', async () => {
    const fetchFn = vi.fn();
    const s = service({}, fetchFn);
    expect(s.isFcmConfigured()).toBe(false);
    expect(await s.send([target('1')], { title: 't', body: 'b' })).toEqual({ sent: 0, invalidIds: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('exchanges a signed JWT once, reuses the access token and stringifies data', async () => {
    const fetchFn = vi.fn(async (url: string, init: any) => {
      if (url.includes('oauth2')) {
        expect(String(init.body)).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
        return json({ access_token: 'ya29.token', expires_in: 3600 });
      }
      expect(url).toBe('https://fcm.googleapis.com/v1/projects/demo/messages:send');
      expect(init.headers.authorization).toBe('Bearer ya29.token');
      expect(JSON.parse(init.body).message.data).toEqual({ chatId: 'c1', n: '5' });
      return json({ name: 'projects/demo/messages/1' });
    });
    const s = service({ FCM_SERVICE_ACCOUNT_JSON: account }, fetchFn);
    const result = await s.send([target('1'), target('2')], { title: 't', body: 'b', data: { chatId: 'c1', n: 5 } });
    expect(result.sent).toBe(2);
    expect(fetchFn.mock.calls.filter((c) => String(c[0]).includes('oauth2'))).toHaveLength(1);
  });

  it('marks unregistered tokens as invalid and keeps going on other errors', async () => {
    const fetchFn = vi.fn(async (url: string, init: any) => {
      if (url.includes('oauth2')) return json({ access_token: 't', expires_in: 3600 });
      const token = JSON.parse(init.body).message.token as string;
      if (token.includes('-gone-')) return json({ error: { status: 'UNREGISTERED' } }, 404);
      if (token.includes('-down-')) return json({}, 500);
      return json({});
    });
    const s = service({ FCM_SERVICE_ACCOUNT_JSON: account }, fetchFn);
    const result = await s.send([target('gone'), target('down'), target('ok')], { title: 't', body: 'b' });
    expect(result).toEqual({ sent: 1, invalidIds: ['gone'] });
  });
});
