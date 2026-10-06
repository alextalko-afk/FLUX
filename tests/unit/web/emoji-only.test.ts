import { describe, it, expect } from 'vitest';
import { isEmojiOnly } from '../../../apps/web/src/lib/format';

describe('isEmojiOnly', () => {
  it('accepts one to three emoji, with modifiers and joiners', () => {
    expect(isEmojiOnly('🎉')).toBe(true);
    expect(isEmojiOnly('👍🏽')).toBe(true);
    expect(isEmojiOnly('👨‍👩‍👧')).toBe(true);
    expect(isEmojiOnly('😀 😀 😀')).toBe(true);
  });

  it('rejects text, digits, four emoji and empty values', () => {
    expect(isEmojiOnly('hi 🎉')).toBe(false);
    expect(isEmojiOnly('123')).toBe(false);
    expect(isEmojiOnly('😀😀😀😀')).toBe(false);
    expect(isEmojiOnly('')).toBe(false);
    expect(isEmojiOnly(null)).toBe(false);
  });
});
