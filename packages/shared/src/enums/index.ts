export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
}

export enum ChatType {
  PRIVATE = 'PRIVATE',
  GROUP = 'GROUP',
  CHANNEL = 'CHANNEL',
  SAVED = 'SAVED',
  SECRET = 'SECRET',
}

export enum ChatMemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  RESTRICTED = 'RESTRICTED',
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  VOICE = 'VOICE',
  VIDEO_NOTE = 'VIDEO_NOTE',
  DOCUMENT = 'DOCUMENT',
  STICKER = 'STICKER',
  LOCATION = 'LOCATION',
  CONTACT = 'CONTACT',
  POLL = 'POLL',
  SYSTEM = 'SYSTEM',
}

export enum MessageStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export enum CallStatus {
  INITIATING = 'INITIATING',
  RINGING = 'RINGING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  MISSED = 'MISSED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export enum CallType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}

export enum PresenceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  AWAY = 'AWAY',
  DND = 'DND',
}

export enum MediaType {
  AVATAR = 'AVATAR',
  CHAT_MEDIA = 'CHAT_MEDIA',
  VOICE = 'VOICE',
  VIDEO = 'VIDEO',
  STICKER = 'STICKER',
  EXPORT = 'EXPORT',
  TEMP = 'TEMP',
}

export enum NotificationType {
  MESSAGE = 'MESSAGE',
  CALL = 'CALL',
  MENTION = 'MENTION',
  SYSTEM = 'SYSTEM',
}
