import { describe, it, expect } from 'vitest';
import { isCommonPassword } from '../../../apps/server/src/common/validators/is-not-common-password';

describe('common password check', () => {
  it('rejects well-known passwords in any case', () => {
    for (const p of ['Password123', 'QWERTY123', '12345678', 'P@ssw0rd']) expect(isCommonPassword(p)).toBe(true);
  });
  it('accepts others and non-strings', () => {
    expect(isCommonPassword('Str0ngPass!234')).toBe(false);
    expect(isCommonPassword(undefined)).toBe(false);
  });
});
