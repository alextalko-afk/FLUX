import { describe, it, expect } from 'vitest';
import { formatChatListTime } from '../../../apps/web/src/lib/format';

const now = new Date(2026, 9, 7, 15, 30).getTime();

describe('formatChatListTime', () => {
  it('shows the time for today', () => {
    expect(formatChatListTime(new Date(2026, 9, 7, 9, 5), 'en', now)).toMatch(/9:05|09:05/);
  });
  it('shows the weekday within the last week', () => {
    expect(formatChatListTime(new Date(2026, 9, 5, 12, 0), 'en', now)).toBe('Mon');
  });
  it('shows the date for older messages, with the year when it differs', () => {
    expect(formatChatListTime(new Date(2026, 8, 1, 12, 0), 'en', now)).toBe('09/01');
    expect(formatChatListTime(new Date(2025, 8, 1, 12, 0), 'en', now)).toBe('09/01/25');
  });
});
