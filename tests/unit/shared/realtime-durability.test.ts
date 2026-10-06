import { describe, it, expect } from 'vitest';
import {
  RealtimeEvent,
  isDurableRealtimeEvent,
  REALTIME_REPLAY_WINDOW,
  REALTIME_SYNC_PAGE_SIZE,
} from '../../../packages/shared/src/realtime/events';

describe('isDurableRealtimeEvent', () => {
  it.each([
    RealtimeEvent.MESSAGE_NEW,
    RealtimeEvent.MESSAGE_UPDATED,
    RealtimeEvent.MESSAGE_DELETED,
    RealtimeEvent.MESSAGE_READ,
    RealtimeEvent.CHAT_CREATED,
    RealtimeEvent.CHAT_UPDATED,
    RealtimeEvent.CHAT_DELETED,
    RealtimeEvent.USER_PROFILE_UPDATED,
  ])('replays %s after a reconnect', (event) => {
    expect(isDurableRealtimeEvent(event)).toBe(true);
  });

  it.each([
    RealtimeEvent.CONNECTION_AUTHENTICATED,
    RealtimeEvent.CHAT_TYPING_START,
    RealtimeEvent.CHAT_TYPING_STOP,
    RealtimeEvent.CHAT_RECORDING_AUDIO_START,
    RealtimeEvent.USER_PRESENCE_ONLINE,
    RealtimeEvent.USER_PRESENCE_OFFLINE,
    RealtimeEvent.CALL_INCOMING,
    RealtimeEvent.CALL_ENDED,
    RealtimeEvent.CALL_ICE,
    RealtimeEvent.CALL_SDP,
  ])('does not replay %s: it is only meaningful live', (event) => {
    expect(isDurableRealtimeEvent(event)).toBe(false);
  });

  it('treats an unknown event as durable so state is never silently dropped', () => {
    expect(isDurableRealtimeEvent('some.future.event')).toBe(true);
  });

  it('keeps a sync page no larger than the replay window', () => {
    expect(REALTIME_SYNC_PAGE_SIZE).toBeLessThanOrEqual(REALTIME_REPLAY_WINDOW);
  });
});
