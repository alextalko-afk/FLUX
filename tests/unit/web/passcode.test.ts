import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hasPasscode,
  removePasscode,
  setPasscode,
  verifyPasscode,
} from '../../../apps/web/src/features/lock/passcode';

const USER = 'user-1';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
});

describe('app passcode', () => {
  it('stores a hash, never the PIN', async () => {
    await setPasscode(USER, '4821');
    expect(hasPasscode(USER)).toBe(true);
    expect(localStorage.getItem(`flux.passcode.${USER}`)).not.toContain('4821');
  });

  it('accepts the right PIN and rejects a wrong one', async () => {
    await setPasscode(USER, '4821');
    expect((await verifyPasscode(USER, '4821')).ok).toBe(true);
    expect((await verifyPasscode(USER, '1111')).ok).toBe(false);
  });

  it('refuses PINs of the wrong shape', async () => {
    await expect(setPasscode(USER, '12')).rejects.toThrow();
    await expect(setPasscode(USER, 'abcd')).rejects.toThrow();
  });

  it('slows guessing after five wrong tries and drops the passcode after ten', async () => {
    await setPasscode(USER, '4821');
    for (let i = 0; i < 4; i += 1) expect(await verifyPasscode(USER, '0000')).toMatchObject({ ok: false, retryAfterMs: 0 });

    const fifth = await verifyPasscode(USER, '0000');
    expect(fifth.ok === false && fifth.retryAfterMs).toBeGreaterThan(0);
    // Even the correct PIN is refused while the wait runs.
    expect((await verifyPasscode(USER, '4821')).ok).toBe(false);

    // Skip the waits and finish the remaining wrong tries.
    const key = `flux.passcode.${USER}`;
    let last: Awaited<ReturnType<typeof verifyPasscode>> | undefined;
    for (let i = 0; i < 5; i += 1) {
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...stored, lockedUntil: 0 }));
      last = await verifyPasscode(USER, '0000');
    }
    expect(last).toMatchObject({ ok: false, wiped: true });
    expect(hasPasscode(USER)).toBe(false);
  }, 30_000);

  it('can be removed', async () => {
    await setPasscode(USER, '4821');
    removePasscode(USER);
    expect(hasPasscode(USER)).toBe(false);
  });
});
