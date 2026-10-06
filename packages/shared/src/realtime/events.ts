export enum RealtimeEvent {
  CONNECTION_AUTHENTICATED = 'connection.authenticated',
  CONNECTION_UNAUTHORIZED = 'connection.unauthorized',
  CONNECTION_RECONNECT_REQUIRED = 'connection.reconnect_required',
  CHAT_CREATED = 'chat.created',
  CHAT_UPDATED = 'chat.updated',
  CHAT_DELETED = 'chat.deleted',
  CHAT_MEMBER_ADDED = 'chat.member_added',
  CHAT_MEMBER_REMOVED = 'chat.member_removed',
  CHAT_MEMBER_UPDATED = 'chat.member_updated',
  CHAT_TYPING_START = 'chat.typing.start',
  CHAT_TYPING_STOP = 'chat.typing.stop',
  CHAT_RECORDING_AUDIO_START = 'chat.recording_audio.start',
  CHAT_RECORDING_AUDIO_STOP = 'chat.recording_audio.stop',
  MESSAGE_NEW = 'message.new',
  MESSAGE_UPDATED = 'message.updated',
  MESSAGE_DELETED = 'message.deleted',
  MESSAGE_REACTION_UPDATED = 'message.reaction.updated',
  MESSAGE_READ = 'message.read',
  MESSAGE_PIN_UPDATED = 'message.pin.updated',
  MESSAGE_DELIVERED = 'message.delivered',
  MESSAGE_FAILED = 'message.failed',
  DRAFT_UPDATED = 'draft.updated',
  FOLDER_UPDATED = 'folder.updated',
  CONTACT_UPDATED = 'contact.updated',
  USER_PRESENCE_ONLINE = 'user.presence.online',
  USER_PRESENCE_OFFLINE = 'user.presence.offline',
  USER_PROFILE_UPDATED = 'user.profile.updated',
  CALL_INCOMING = 'call.incoming',
  CALL_ACCEPTED = 'call.accepted',
  CALL_REJECTED = 'call.rejected',
  CALL_ENDED = 'call.ended',
  CALL_ICE = 'call.ice',
  CALL_SDP = 'call.sdp',
  NOTIFICATION_SETTINGS_UPDATED = 'notification.settings.updated',
  SESSION_CREATED = 'session.created',
  SESSION_REVOKED = 'session.revoked',
  ADMIN_ACTION = 'admin.action',
  SYSTEM_MAINTENANCE = 'system.maintenance',
}

/**
 * Wire format version of the realtime envelope.
 *
 * Bumped when the shape of {@link IRealtimeMessage} changes in a way that older
 * clients cannot parse. Receivers should ignore messages whose major version
 * they do not understand instead of failing the whole connection.
 */
export const REALTIME_PROTOCOL_VERSION = 1;

export interface IRealtimeMessage<T = any> {
  event: string;
  payload: T;
  timestamp: number;
  version: number;
  /**
   * Per-user, strictly increasing number stamped on every durable event. A
   * client that remembers the last one it applied can ask `GET /sync?after=`
   * for everything it missed while disconnected.
   */
  sequenceId?: number;
  correlationId?: string;
}

/**
 * Events that only mean something while the socket is open. They are never
 * sequenced or replayed: a stale typing flag, ICE candidate or "user came
 * online" frame delivered after a reconnect would be wrong, not helpful.
 */
const EPHEMERAL_REALTIME_EVENTS: ReadonlySet<string> = new Set<string>([
  RealtimeEvent.CONNECTION_AUTHENTICATED,
  RealtimeEvent.CONNECTION_UNAUTHORIZED,
  RealtimeEvent.CONNECTION_RECONNECT_REQUIRED,
  RealtimeEvent.CHAT_TYPING_START,
  RealtimeEvent.CHAT_TYPING_STOP,
  RealtimeEvent.CHAT_RECORDING_AUDIO_START,
  RealtimeEvent.CHAT_RECORDING_AUDIO_STOP,
  RealtimeEvent.USER_PRESENCE_ONLINE,
  RealtimeEvent.USER_PRESENCE_OFFLINE,
  RealtimeEvent.CALL_INCOMING,
  RealtimeEvent.CALL_ACCEPTED,
  RealtimeEvent.CALL_REJECTED,
  RealtimeEvent.CALL_ENDED,
  RealtimeEvent.CALL_ICE,
  RealtimeEvent.CALL_SDP,
  RealtimeEvent.SYSTEM_MAINTENANCE,
]);

/** True for events that carry state a reconnecting client must not lose. */
export function isDurableRealtimeEvent(event: string): boolean {
  return !EPHEMERAL_REALTIME_EVENTS.has(event);
}

/** How many sequenced events the server keeps per user for replay. */
export const REALTIME_REPLAY_WINDOW = 1000;

/** Largest page of replayed events returned by one `GET /sync` call. */
export const REALTIME_SYNC_PAGE_SIZE = 500;

/**
 * Response of `GET /sync?after=<sequenceId>`.
 *
 * - `events` are the missed events in order, at most {@link REALTIME_SYNC_PAGE_SIZE}.
 * - `head` is the newest sequence id issued to the user.
 * - `hasMore` means the page was full: call again with `after` set to the last
 *   returned sequence id.
 * - `reset` means the gap cannot be replayed (older than the replay window,
 *   or the client's cursor is ahead of the server). The client must discard
 *   its caches and reload from the REST API, then continue from `head`.
 */
export interface IRealtimeSyncResponse {
  events: IRealtimeMessage[];
  head: number;
  hasMore: boolean;
  reset: boolean;
}
