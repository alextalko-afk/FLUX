import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, WS_URL, api, createUser, removeUser, resetRateLimits, wait, wsTicket } from './helpers';

const connect = (query: string) =>
  new Promise<{ code: number | null; authenticated: boolean }>((resolve) => {
    const socket = new WebSocket(`${WS_URL}?${query}`);
    let authenticated = false;
    socket.onmessage = (event) => {
      if (JSON.parse(String(event.data)).event === 'connection.authenticated') authenticated = true;
    };
    socket.onclose = (event) => resolve({ code: event.code, authenticated });
    setTimeout(() => {
      socket.close();
    }, 1500);
  });

describe('websocket tickets', () => {
  let user: TestUser;
  beforeAll(async () => {
    await resetRateLimits();
    user = await createUser('wst');
  });
  afterAll(() => removeUser(user));

  it('needs a signed-in user to issue a ticket', async () => {
    expect((await api('POST', '/sync/ticket')).status).toBe(401);
  });

  it('no longer accepts the access token in the URL', async () => {
    const result = await connect(`token=${encodeURIComponent(user.token)}`);
    expect(result.authenticated).toBe(false);
    expect(result.code).toBe(4001);
  });

  it('accepts a ticket once and refuses it the second time', async () => {
    const ticket = await wsTicket(user.token);
    expect((await connect(`ticket=${ticket}`)).authenticated).toBe(true);
    await wait(100);
    const again = await connect(`ticket=${ticket}`);
    expect(again.authenticated).toBe(false);
    expect(again.code).toBe(4001);
  });

  it('refuses invented tickets', async () => {
    expect((await connect(`ticket=${'a'.repeat(43)}`)).authenticated).toBe(false);
  });
});
