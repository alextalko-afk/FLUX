/**
 * App passcode: a PIN that covers the screen after a reload or a period of
 * inactivity. It is a local screen lock for a shared or unattended computer.
 * The PIN never leaves the browser; only a salted PBKDF2 hash is stored.
 * It does not encrypt data already in the browser, and signing out is always
 * possible from the lock screen.
 */
const ITERATIONS = 310_000;
const MAX_FAILS = 10;
const FREE_FAILS = 5;
export const PIN_PATTERN = /^\d{4,12}$/;
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 60];

interface StoredPasscode {
  v: 1;
  salt: string;
  hash: string;
  iterations: number;
  autoLockMinutes: number;
  fails: number;
  lockedUntil: number;
}

const keyFor = (userId: string) => `flux.passcode.${userId}`;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

function read(userId: string): StoredPasscode | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const parsed = raw ? (JSON.parse(raw) as StoredPasscode) : null;
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function write(userId: string, value: StoredPasscode): void {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(value));
  } catch {
    // Storage blocked: the passcode simply cannot be kept.
  }
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, material, 256);
  return new Uint8Array(bits);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function hasPasscode(userId: string): boolean {
  return read(userId) !== null;
}

export function getAutoLockMinutes(userId: string): number {
  return read(userId)?.autoLockMinutes ?? 5;
}

export async function setPasscode(userId: string, pin: string, autoLockMinutes = 5): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw new Error('PIN_FORMAT');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  write(userId, {
    v: 1,
    salt: toB64(salt),
    hash: toB64(hash),
    iterations: ITERATIONS,
    autoLockMinutes,
    fails: 0,
    lockedUntil: 0,
  });
}

export function setAutoLockMinutes(userId: string, minutes: number): void {
  const stored = read(userId);
  if (stored) write(userId, { ...stored, autoLockMinutes: minutes });
}

export function removePasscode(userId: string): void {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number; wiped: false }
  | { ok: false; retryAfterMs: 0; wiped: true };

/**
 * Checks a PIN. After five wrong tries each further one waits longer, and after
 * ten the passcode is dropped and the caller must sign the user out: a PIN of
 * a few digits cannot survive unlimited guessing, so guessing is not unlimited.
 */
export async function verifyPasscode(userId: string, pin: string): Promise<VerifyResult> {
  const stored = read(userId);
  if (!stored) return { ok: true };

  const now = Date.now();
  if (stored.lockedUntil > now) return { ok: false, retryAfterMs: stored.lockedUntil - now, wiped: false };

  const actual = await derive(pin, fromB64(stored.salt), stored.iterations);
  if (sameBytes(actual, fromB64(stored.hash))) {
    write(userId, { ...stored, fails: 0, lockedUntil: 0 });
    return { ok: true };
  }

  const fails = stored.fails + 1;
  if (fails >= MAX_FAILS) {
    removePasscode(userId);
    return { ok: false, retryAfterMs: 0, wiped: true };
  }
  const delay = fails >= FREE_FAILS ? Math.min(30_000 * 2 ** (fails - FREE_FAILS), 15 * 60_000) : 0;
  write(userId, { ...stored, fails, lockedUntil: delay ? now + delay : 0 });
  return { ok: false, retryAfterMs: delay, wiped: false };
}
