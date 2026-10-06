import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';
import { generateKeyPair, type DeviceKeyPair } from '../../../apps/web/src/services/e2ee/e2ee';
import {
  decryptGroup,
  encryptGroup,
  newGroupKey,
  openGroupKey,
  sealGroupKey,
} from '../../../apps/web/src/services/e2ee/groupCrypto';

describe('end-to-end encrypted groups', () => {
  let owner: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  const keys: Record<string, DeviceKeyPair> = {};
  const device: Record<string, string> = {};
  let chat: string;

  const reg = async (u: TestUser) => {
    keys[u.id] = await generateKeyPair();
    device[u.id] = (await api('POST', '/security/devices', { publicKey: keys[u.id]!.publicKey, label: 't' }, u.token)).json.id;
  };
  const share = async (key: Uint8Array, u: TestUser) => ({
    userId: u.id,
    deviceKeyId: device[u.id]!,
    sealed: await sealGroupKey(key, keys[u.id]!.publicKey),
  });
  const send = (user: TestUser, body: object) =>
    api('POST', `/chats/${chat}/messages`, { type: 'TEXT', clientTempId: crypto.randomUUID(), ...body }, user.token);
  const myKey = async (u: TestUser) =>
    openGroupKey((await api('GET', `/chats/${chat}/e2ee`, undefined, u.token)).json.myShares[0].sealed, keys[u.id]!);

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('ge_o');
    bob = await createUser('ge_b');
    carol = await createUser('ge_c');
    for (const u of [owner, bob, carol]) await reg(u);
  });

  afterAll(async () => {
    for (const u of [owner, bob, carol]) await removeUser(u);
  });

  it('needs a device key to create, and creates an encrypted group', async () => {
    const lone = await createUser('ge_n');
    const refused = await api('POST', '/chats/group', { title: 'x', memberIds: [bob.id], e2ee: true }, lone.token);
    expect(refused.json.code).toBe('E2EE_NO_DEVICE_KEY');
    await removeUser(lone);

    const res = await api('POST', '/chats/group', { title: 'Secret team', memberIds: [bob.id, carol.id], e2ee: true }, owner.token);
    expect(res.status).toBe(201);
    expect(res.json.e2ee).toBe(true);
    chat = res.json.id;
  });

  it('distributes the key to members, who can open it and read each other', async () => {
    const key0 = await newGroupKey();
    const stored = await api(
      'PUT',
      `/chats/${chat}/e2ee/shares`,
      { epoch: 0, shares: [await share(key0, owner), await share(key0, bob), await share(key0, carol)] },
      owner.token,
    );
    expect(stored.status).toBe(200);
    expect((await api('PUT', `/chats/${chat}/e2ee/shares`, { epoch: 0, shares: [await share(key0, bob)] }, bob.token)).status).toBe(403);

    const info = await api('GET', `/chats/${chat}/e2ee`, undefined, bob.token);
    expect(info.json.members.every((m: { hasShare: boolean }) => m.hasShare)).toBe(true);
    const bobKey = await myKey(bob);
    expect(Buffer.from(bobKey).equals(Buffer.from(key0))).toBe(true);

    const text = await encryptGroup(bobKey, chat, 0, 'hello team');
    expect((await send(bob, { content: text })).status).toBe(201);
    const history = await api('GET', `/chats/${chat}/messages`, undefined, carol.token);
    const content = history.json.items[0].content;
    expect(content).not.toContain('hello');
    expect(await decryptGroup(await myKey(carol), chat, content)).toBe('hello team');
  });

  it('refuses plaintext, a wrong epoch and features that would leak content', async () => {
    expect((await send(owner, { content: 'plain text' })).json.code).toBe('SECRET_PLAINTEXT_REJECTED');
    const future = await encryptGroup(await newGroupKey(), chat, 5, 'x');
    expect((await send(owner, { content: future })).json.code).toBe('E2EE_EPOCH_STALE');
    expect((await api('POST', `/chats/${chat}/polls`, { question: 'q', options: ['a', 'b'] }, owner.token)).status).toBe(400);
  });

  it('rotates after a member leaves, and the old epoch stops working', async () => {
    await api('DELETE', `/chats/${chat}/members/${carol.id}`, undefined, owner.token);
    expect((await api('GET', `/chats/${chat}/e2ee`, undefined, owner.token)).json.rotationNeeded).toBe(true);

    const key1 = await newGroupKey();
    const incomplete = await api('PUT', `/chats/${chat}/e2ee/shares`, { epoch: 1, shares: [await share(key1, owner)] }, owner.token);
    expect(incomplete.json.code).toBe('E2EE_ROTATION_INCOMPLETE');
    const ok = await api('PUT', `/chats/${chat}/e2ee/shares`, { epoch: 1, shares: [await share(key1, owner), await share(key1, bob)] }, owner.token);
    expect(ok.status).toBe(200);

    const info = await api('GET', `/chats/${chat}/e2ee`, undefined, owner.token);
    expect(info.json.epoch).toBe(1);
    expect(info.json.myShares.map((s: { epoch: number }) => s.epoch)).toEqual([1, 0]);
    expect((await api('GET', `/chats/${chat}/e2ee`, undefined, carol.token)).status).toBe(404);

    const old = await encryptGroup(await newGroupKey(), chat, 0, 'late');
    expect((await send(bob, { content: old })).json.code).toBe('E2EE_EPOCH_STALE');
    expect((await api('PUT', `/chats/${chat}/e2ee/shares`, { epoch: 1, shares: [] }, bob.token)).status).toBe(403);
  });
});
