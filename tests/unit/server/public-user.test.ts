import { describe, it, expect } from 'vitest';
import {
  PUBLIC_USER_SELECT,
  projectChat,
  projectMessage,
  projectUser,
} from '../../../apps/server/src/privacy/public-user';

const lastSeenAt = new Date('2026-10-05T10:00:00Z');

/** A user row as the safe select returns it, plus the owner's privacy switches. */
const row = (overrides: Record<string, unknown> = {}, privacy: Record<string, boolean> | null = null) =>
  ({
    id: 'u1',
    username: 'ann',
    firstName: 'Ann',
    lastName: 'Lee',
    bio: 'private bio',
    avatarUrl: 'https://cdn.example/a.png',
    presence: 'ONLINE',
    lastSeenAt,
    isVerified: false,
    deletedAt: null,
    privacySettings: privacy,
    ...overrides,
  }) as any;

describe('PUBLIC_USER_SELECT', () => {
  it('never selects credentials, roles or moderation flags', () => {
    const keys = Object.keys(PUBLIC_USER_SELECT);
    for (const forbidden of ['role', 'isBlocked', 'passwordCredential', 'emails', 'phones', 'sessions']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe('projectUser', () => {
  it('shows everything the owner allows', () => {
    const view = projectUser(row(), 'someone-else');
    expect(view).toMatchObject({
      bio: 'private bio',
      avatarUrl: 'https://cdn.example/a.png',
      presence: 'ONLINE',
      lastSeenAt,
    });
  });

  it('removes the privacy settings and internal fields from the result', () => {
    const view = projectUser(row({}, { showBio: false }), 'someone-else') as any;
    expect(view).not.toHaveProperty('privacySettings');
    expect(view).not.toHaveProperty('deletedAt');
  });

  it.each([
    ['showBio', 'bio', null],
    ['showProfilePhoto', 'avatarUrl', null],
    ['showLastSeen', 'lastSeenAt', null],
    ['showOnlineStatus', 'presence', 'OFFLINE'],
  ])('hides %s from other accounts without revealing that it is hidden', (flag, field, neutral) => {
    const view = projectUser(row({}, { [flag]: false }), 'someone-else') as any;
    expect(view[field]).toBe(neutral);
  });

  it('lets the owner see their own hidden fields', () => {
    const view = projectUser(
      row({}, { showBio: false, showProfilePhoto: false, showLastSeen: false, showOnlineStatus: false }),
      'u1',
    );
    expect(view).toMatchObject({ bio: 'private bio', presence: 'ONLINE', lastSeenAt });
    expect(view.avatarUrl).toBe('https://cdn.example/a.png');
  });

  it('treats an unknown viewer (a webhook, say) like any other account', () => {
    const view = projectUser(row({}, { showLastSeen: false }));
    expect(view.lastSeenAt).toBeNull();
  });

  it('falls back to the permissive defaults when the owner never opened privacy settings', () => {
    expect(projectUser(row({}, null), 'x').bio).toBe('private bio');
  });
});

describe('projectMessage', () => {
  const message = () => ({
    id: 'm1',
    content: 'hi',
    sender: row({}, { showLastSeen: false }),
    replyTo: { id: 'm0', content: 'earlier', sender: row({ id: 'u2', firstName: 'Bo' }, { showBio: false }) },
  });

  it('filters the sender for the viewer', () => {
    const projected = projectMessage(message(), 'viewer') as any;
    expect(projected.sender.lastSeenAt).toBeNull();
    expect(projected.sender).not.toHaveProperty('privacySettings');
  });

  it('filters the sender of the quoted message too', () => {
    const projected = projectMessage(message(), 'viewer') as any;
    expect(projected.replyTo.sender.bio).toBeNull();
    expect(projected.replyTo.content).toBe('earlier');
  });

  it('does not mutate the input', () => {
    const original = message();
    projectMessage(original, 'viewer');
    expect(original.sender.lastSeenAt).toBe(lastSeenAt);
  });

  it('leaves a message without a sender untouched', () => {
    expect(projectMessage({ id: 'm', content: 'x' }, 'v')).toEqual({ id: 'm', content: 'x' });
  });
});

describe('projectChat', () => {
  it('projects every member for the viewer and keeps membership data', () => {
    const chat = {
      id: 'c1',
      members: [
        { userId: 'u1', role: 'OWNER', user: row({}, { showProfilePhoto: false }) },
        { userId: 'u2', role: 'MEMBER', user: row({ id: 'u2' }, null) },
      ],
    };

    const projected = projectChat(chat, 'viewer') as any;
    expect(projected.members[0].role).toBe('OWNER');
    expect(projected.members[0].user.avatarUrl).toBeNull();
    expect(projected.members[1].user.avatarUrl).toBe('https://cdn.example/a.png');
  });

  it('shows the same chat differently to two viewers', () => {
    const chat = { id: 'c1', members: [{ userId: 'u1', user: row({}, { showLastSeen: false }) }] };
    const forOwner = projectChat(chat, 'u1') as any;
    const forOther = projectChat(chat, 'u2') as any;
    expect(forOwner.members[0].user.lastSeenAt).toEqual(lastSeenAt);
    expect(forOther.members[0].user.lastSeenAt).toBeNull();
  });

  it('passes a chat without members through', () => {
    expect(projectChat({ id: 'c1' }, 'v')).toEqual({ id: 'c1' });
  });
});
