import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TestUser,
  api,
  createUser,
  openPrivateChat,
  removeUser,
  resetRateLimits,
  sendText,
} from './helpers';
import {
  deriveSession,
  encryptText,
  generateKeyPair,
  type DeviceKeyPair,
} from '../../../apps/web/src/services/e2ee/e2ee';

describe('secret chats', () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let aliceKeys: DeviceKeyPair;
  let bobKeys: DeviceKeyPair;
  let aliceDevice: string;
  let bobDevice: string;
  let secret: string;

  const register = async (user: TestUser, keys: DeviceKeyPair) =>
    (await api('POST', '/security/devices', { publicKey: keys.publicKey, label: 'test' }, user.token)).json
      .id as string;

  beforeAll(async () => {
    await resetRateLimits();
    alice = await createUser('sec_a');
    bob = await createUser('sec_b');
    carol = await createUser('sec_c');
    aliceKeys = await generateKeyPair();
    bobKeys = await generateKeyPair();
    aliceDevice = await register(alice, aliceKeys);
    bobDevice = await register(bob, bobKeys);

    const created = await api(
      'POST',
      '/chats/secret',
      { targetUserId: bob.id, deviceKeyId: aliceDevice },
      alice.token,
    );
    secret = created.json.id ?? created.json.chat?.id;
  });

  afterAll(async () => {
    await removeUser(alice);
    await removeUser(bob);
    await removeUser(carol);
  });

  it('stores public keys only and rejects malformed ones', async () => {
    const list = await api('GET', '/security/devices', undefined, alice.token);
    expect(list.status).toBe(200);
    expect(list.text).not.toContain(aliceKeys.privateKey);

    const bad = await api('POST', '/security/devices', { publicKey: 'short' }, alice.token);
    expect(bad.status).toBe(400);
  });

  it('binds the chat to one device per side and shows both public keys to members', async () => {
    const info = await api('GET', `/chats/${secret}/secret`, undefined, bob.token);
    expect(info.status).toBe(200);
    expect(info.json.self.publicKey).toBe(bobKeys.publicKey);
    expect(info.json.peer.publicKey).toBe(aliceKeys.publicKey);
    expect(info.json.self.deviceKeyId).toBe(bobDevice);
  });

  it('hides the chat from non-members', async () => {
    expect((await api('GET', `/chats/${secret}/secret`, undefined, carol.token)).status).toBe(404);
  });

  it('refuses a secret chat with someone who has no device, or with yourself', async () => {
    const noDevice = await api(
      'POST',
      '/chats/secret',
      { targetUserId: carol.id, deviceKeyId: aliceDevice },
      alice.token,
    );
    expect(noDevice.status).toBe(409);
    expect(noDevice.json.code).toBe('SECRET_PEER_UNAVAILABLE');

    const self = await api(
      'POST',
      '/chats/secret',
      { targetUserId: alice.id, deviceKeyId: aliceDevice },
      alice.token,
    );
    expect(self.json.code).toBe('SECRET_SELF');
  });

  it('accepts ciphertext and rejects plaintext', async () => {
    const plain = await sendText(alice.token, secret, 'hello in the clear');
    expect(plain.status).toBe(400);
    expect(plain.json.code).toBe('SECRET_PLAINTEXT_REJECTED');

    const session = await deriveSession(aliceKeys, bobKeys.publicKey, alice.id, bob.id);
    const ok = await sendText(alice.token, secret, await encryptText(session, secret, 'hi'));
    expect(ok.status).toBe(201);
  });

  it('refuses to pin or forward secret messages and keeps them out of search', async () => {
    const session = await deriveSession(aliceKeys, bobKeys.publicKey, alice.id, bob.id);
    const sent = await sendText(alice.token, secret, await encryptText(session, secret, 'needle'));

    const pin = await api('POST', `/chats/${secret}/messages/${sent.json.id}/pin`, {}, alice.token);
    expect(pin.status).toBe(400);

    const dm = await openPrivateChat(alice.token, bob.id);
    const forward = await api(
      'POST',
      `/chats/${secret}/messages/${sent.json.id}/forward`,
      { chatIds: [dm] },
      alice.token,
    );
    expect(forward.json.code).toBe('SECRET_FORWARD_FORBIDDEN');

    const search = await api('GET', `/search/messages?q=e2e1`, undefined, alice.token);
    expect(search.text).not.toContain(sent.json.id);
  });

  it('keeps the chat after the key is revoked but marks it revoked', async () => {
    expect((await api('DELETE', `/security/devices/${bobDevice}`, undefined, bob.token)).status).toBe(200);
    const info = await api('GET', `/chats/${secret}/secret`, undefined, alice.token);
    expect(info.json.peer.revoked).toBe(true);
  });
});
