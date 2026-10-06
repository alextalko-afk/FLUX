import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRIVACY_FLAGS,
  PRIVACY_FLAG_KEYS,
  definePrivacyPatch,
  pickPrivacyFlags,
  resolveVisibility,
} from '../../../apps/server/src/privacy/privacy.flags';

describe('privacy flags', () => {
  it('defines exactly 14 unique switches', () => {
    expect(PRIVACY_FLAG_KEYS).toHaveLength(14);
    expect(new Set(PRIVACY_FLAG_KEYS).size).toBe(14);
  });

  it('starts permissive, except phone number visibility', () => {
    expect(DEFAULT_PRIVACY_FLAGS).toMatchObject({
      showLastSeen: true,
      showOnlineStatus: true,
      showProfilePhoto: true,
      showBio: true,
      showPhoneNumber: false,
      showReadReceipts: true,
      showTypingStatus: true,
      allowCalls: true,
      allowGroupInvites: true,
      allowMessages: true,
      allowForwarding: true,
      allowSavingMedia: true,
      allowP2P: true,
      findByPhone: true,
    });
  });

  describe('pickPrivacyFlags', () => {
    it('returns the defaults for an empty row', () => {
      expect(pickPrivacyFlags({})).toEqual(DEFAULT_PRIVACY_FLAGS);
    });

    it('applies the stored booleans and fills the rest', () => {
      expect(
        pickPrivacyFlags({ showLastSeen: false, allowCalls: false }),
      ).toMatchObject({ showLastSeen: false, allowCalls: false, showBio: true });
    });

    it('ignores non-boolean values', () => {
      const flags = pickPrivacyFlags({ showLastSeen: 'nope' as unknown as boolean });
      expect(flags.showLastSeen).toBe(true);
    });
  });

  describe('definePrivacyPatch', () => {
    it('keeps only the provided booleans', () => {
      expect(definePrivacyPatch({ showBio: false })).toEqual({ showBio: false });
    });

    it('drops unknown and non-boolean fields', () => {
      const patch = definePrivacyPatch({
        showBio: 'x' as unknown as boolean,
        allowP2P: true,
      });
      expect(patch).toEqual({ allowP2P: true });
    });
  });

  describe('resolveVisibility', () => {
    const hiddenTarget = {
      id: 'u1',
      privacySettings: {
        showLastSeen: false,
        showOnlineStatus: false,
        showProfilePhoto: false,
        showBio: false,
      },
    };

    it('hides the fields from another viewer', () => {
      expect(resolveVisibility(hiddenTarget, 'u2')).toEqual({
        avatarUrl: false,
        bio: false,
        online: false,
        lastSeen: false,
      });
    });

    it('lets the owner see their own hidden fields', () => {
      expect(resolveVisibility(hiddenTarget, 'u1')).toEqual({
        avatarUrl: true,
        bio: true,
        online: true,
        lastSeen: true,
      });
    });

    it('is permissive when no settings row exists', () => {
      expect(resolveVisibility({ id: 'u1' }, 'u2')).toEqual({
        avatarUrl: true,
        bio: true,
        online: true,
        lastSeen: true,
      });
    });
  });
});
