import { describe, it, expect } from 'vitest';
import {
  RealtimeEvent,
  REALTIME_PROTOCOL_VERSION,
} from '../../../packages/shared/src/realtime/events';
import {
  APP_NAME,
  MAX_UPLOAD_SIZE_MB,
  MAX_UPLOAD_SIZE_BYTES,
  MESSAGE_MAX_LENGTH,
  USERNAME_REGEX,
  DEFAULT_AVATAR_COLORS,
} from '../../../packages/shared/src/constants';

/**
 * The realtime protocol is the contract between server, web and mobile. These
 * tests pin the event names so that a rename cannot silently break a client
 * that is still listening on the old string.
 */
const REQUIRED_EVENTS = [
  'connection.authenticated',
  'connection.unauthorized',
  'connection.reconnect_required',
  'chat.created',
  'chat.updated',
  'chat.deleted',
  'chat.member_added',
  'chat.member_removed',
  'chat.member_updated',
  'chat.typing.start',
  'chat.typing.stop',
  'chat.recording_audio.start',
  'chat.recording_audio.stop',
  'message.new',
  'message.updated',
  'message.deleted',
  'message.reaction.updated',
  'message.read',
  'message.delivered',
  'message.failed',
  'draft.updated',
  'folder.updated',
  'contact.updated',
  'user.presence.online',
  'user.presence.offline',
  'user.profile.updated',
  'call.incoming',
  'call.accepted',
  'call.rejected',
  'call.ended',
  'call.ice',
  'call.sdp',
  'notification.settings.updated',
  'session.created',
  'session.revoked',
  'admin.action',
  'system.maintenance',
] as const;

describe('RealtimeEvent protocol', () => {
  it('exposes every event required by the protocol specification', () => {
    const values = new Set(Object.values(RealtimeEvent));
    const missing = REQUIRED_EVENTS.filter((event) => !values.has(event as RealtimeEvent));
    expect(missing).toEqual([]);
  });

  it('uses dot-delimited namespaced names', () => {
    for (const value of Object.values(RealtimeEvent)) {
      expect(value).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
    }
  });

  it('has no duplicate string values', () => {
    const values = Object.values(RealtimeEvent);
    expect(new Set(values).size).toBe(values.length);
  });

  it('declares a numeric protocol version', () => {
    expect(REALTIME_PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(REALTIME_PROTOCOL_VERSION)).toBe(true);
  });
});

describe('shared constants', () => {
  it('exports the application name', () => {
    expect(APP_NAME).toBe('FLUX');
  });

  it('keeps the byte limit consistent with the megabyte limit', () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(MAX_UPLOAD_SIZE_MB * 1024 * 1024);
  });

  it('keeps the message length limit positive and reasonable', () => {
    expect(MESSAGE_MAX_LENGTH).toBeGreaterThan(0);
    expect(MESSAGE_MAX_LENGTH).toBeLessThanOrEqual(65536);
  });

  it('provides a non-empty avatar colour palette of valid hex colours', () => {
    expect(DEFAULT_AVATAR_COLORS.length).toBeGreaterThan(0);
    for (const colour of DEFAULT_AVATAR_COLORS) {
      expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  describe('USERNAME_REGEX', () => {
    it.each(['abc', 'john_doe', 'User123', 'a'.repeat(32)])(
      'accepts %s',
      (username) => {
        expect(USERNAME_REGEX.test(username)).toBe(true);
      },
    );

    it.each(['ab', 'a'.repeat(33), 'has space', 'has-dash', 'dot.name', ''])(
      'rejects %s',
      (username) => {
        expect(USERNAME_REGEX.test(username)).toBe(false);
      },
    );

    it('is safe to reuse across calls (no global flag state)', () => {
      expect(USERNAME_REGEX.test('validname')).toBe(true);
      expect(USERNAME_REGEX.test('validname')).toBe(true);
    });
  });
});
