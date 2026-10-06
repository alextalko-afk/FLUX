import { Prisma } from '@prisma/client';
import { resolveVisibility } from './privacy.flags';

/**
 * The only user fields that may leave the server about *another* account.
 *
 * `include: { user: true }` returns the entire row: role, block flag, key
 * material, last-seen time and the rest, regardless of what the owner chose to
 * hide. Every query that embeds a user in a response selects this instead, and
 * every response is then passed through {@link projectUser} so the owner's
 * privacy switches are applied for the viewer who receives it.
 */
export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  bio: true,
  avatarUrl: true,
  presence: true,
  lastSeenAt: true,
  isVerified: true,
  deletedAt: true,
  // Needed to resolve visibility; removed again by `projectUser`.
  privacySettings: true,
} satisfies Prisma.UserSelect;

export type SelectedUser = Prisma.UserGetPayload<{ select: typeof PUBLIC_USER_SELECT }>;

export interface PublicUser {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  presence: string;
  lastSeenAt: Date | null;
  isVerified: boolean;
}

/**
 * What `viewerId` is allowed to see of `user`. The owner always sees all of
 * their own fields; for anyone else, hidden fields come back neutral (`null`,
 * or `OFFLINE`) so the response does not even reveal that something is hidden.
 */
export function projectUser(user: SelectedUser, viewerId?: string): PublicUser {
  const visible = resolveVisibility(user, viewerId);

  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    bio: visible.bio ? user.bio : null,
    avatarUrl: visible.avatarUrl ? user.avatarUrl : null,
    presence: visible.online ? user.presence : 'OFFLINE',
    lastSeenAt: visible.lastSeen ? user.lastSeenAt : null,
    isVerified: user.isVerified,
  };
}

const isSelectedUser = (value: unknown): value is SelectedUser =>
  typeof value === 'object' && value !== null && 'id' in value && 'firstName' in value;

/** Replaces `sender` (and a reply's `sender`) of a message with its projection. */
export function projectMessage<T extends object>(message: T, viewerId?: string): T {
  const source = message as { sender?: unknown; replyTo?: unknown };
  const next = { ...message } as Record<string, unknown>;

  if (isSelectedUser(source.sender)) {
    next.sender = projectUser(source.sender, viewerId);
  }

  const reply = source.replyTo as { sender?: unknown } | null | undefined;
  if (reply && isSelectedUser(reply.sender)) {
    next.replyTo = { ...reply, sender: projectUser(reply.sender, viewerId) };
  }

  return next as T;
}

/** Replaces the `user` of every member (or call participant) with its projection. */
export function projectChat<T extends object>(chat: T, viewerId?: string): T {
  const members = (chat as { members?: Array<{ user?: unknown }> }).members;
  if (!members) return chat;

  return {
    ...chat,
    members: members.map((member) =>
      isSelectedUser(member.user) ? { ...member, user: projectUser(member.user, viewerId) } : member,
    ),
  };
}
