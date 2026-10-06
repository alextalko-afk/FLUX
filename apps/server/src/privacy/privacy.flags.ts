/**
 * Pure privacy logic, kept free of Nest and Prisma imports so it can be unit
 * tested in isolation. `PrivacyService` is the thin persistence layer on top.
 */

export interface PrivacyFlags {
  showLastSeen: boolean;
  showOnlineStatus: boolean;
  showProfilePhoto: boolean;
  showBio: boolean;
  showPhoneNumber: boolean;
  findByPhone: boolean;
  showReadReceipts: boolean;
  showTypingStatus: boolean;
  allowCalls: boolean;
  allowGroupInvites: boolean;
  allowMessages: boolean;
  allowForwarding: boolean;
  allowSavingMedia: boolean;
  allowP2P: boolean;
}

/** Every switch in declaration order — the single source for pick/patch. */
export const PRIVACY_FLAG_KEYS: (keyof PrivacyFlags)[] = [
  'showLastSeen',
  'showOnlineStatus',
  'showProfilePhoto',
  'showBio',
  'showPhoneNumber',
  'findByPhone',
  'showReadReceipts',
  'showTypingStatus',
  'allowCalls',
  'allowGroupInvites',
  'allowMessages',
  'allowForwarding',
  'allowSavingMedia',
  'allowP2P',
];

/** Permissive baseline used when an account has never opened privacy settings. */
export const DEFAULT_PRIVACY_FLAGS: PrivacyFlags = {
  showLastSeen: true,
  showOnlineStatus: true,
  showProfilePhoto: true,
  showBio: true,
  showPhoneNumber: false,
  findByPhone: true,
  showReadReceipts: true,
  showTypingStatus: true,
  allowCalls: true,
  allowGroupInvites: true,
  allowMessages: true,
  allowForwarding: true,
  allowSavingMedia: true,
  allowP2P: true,
};

/** Fills a possibly-partial DB row with the defaults. */
export function pickPrivacyFlags(row: Partial<PrivacyFlags>): PrivacyFlags {
  const flags = { ...DEFAULT_PRIVACY_FLAGS };
  for (const key of PRIVACY_FLAG_KEYS) {
    if (typeof row[key] === 'boolean') {
      flags[key] = row[key] as boolean;
    }
  }
  return flags;
}

/** Keeps only the boolean fields present in a PATCH body. */
export function definePrivacyPatch(
  dto: Partial<PrivacyFlags>,
): Partial<PrivacyFlags> {
  const data: Partial<PrivacyFlags> = {};
  for (const key of PRIVACY_FLAG_KEYS) {
    if (typeof dto[key] === 'boolean') {
      data[key] = dto[key] as boolean;
    }
  }
  return data;
}

/**
 * Resolves which of a target's fields a viewer may see.
 *
 * `isSelf` short-circuits every switch: you always see your own profile, even
 * when you hid it from everyone else. A missing `privacySettings` relation
 * falls back to the permissive defaults.
 */
export function resolveVisibility(
  user: { id: string; privacySettings?: Partial<PrivacyFlags> | null },
  viewerId?: string,
): { avatarUrl: boolean; bio: boolean; online: boolean; lastSeen: boolean } {
  const isSelf = Boolean(viewerId) && viewerId === user.id;
  const flags = { ...DEFAULT_PRIVACY_FLAGS, ...(user.privacySettings ?? {}) };
  return {
    avatarUrl: isSelf || flags.showProfilePhoto,
    bio: isSelf || flags.showBio,
    online: isSelf || flags.showOnlineStatus,
    lastSeen: isSelf || flags.showLastSeen,
  };
}
