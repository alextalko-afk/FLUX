import { describe, it, expect } from 'vitest';
import { parsePositiveInt } from '../../../apps/server/src/common/utils/parse-query';

/**
 * `parsePositiveInt` guards one of the documented production traps: with
 * `enableImplicitConversion: false`, a raw `@Query('limit')` parameter arrives
 * as a string. Passing that string straight to Prisma's `take` throws, so every
 * numeric query parameter goes through this helper.
 */
describe('parsePositiveInt', () => {
  it('parses a plain numeric string', () => {
    expect(parsePositiveInt('25', 20, 100)).toBe(25);
  });

  it('returns the fallback for undefined', () => {
    expect(parsePositiveInt(undefined, 20, 100)).toBe(20);
  });

  it('returns the fallback for null', () => {
    expect(parsePositiveInt(null, 20, 100)).toBe(20);
  });

  it('returns the fallback for an empty string', () => {
    expect(parsePositiveInt('', 20, 100)).toBe(20);
  });

  it('returns the fallback for non-numeric text', () => {
    expect(parsePositiveInt('abc', 20, 100)).toBe(20);
  });

  it('never returns NaN (the bug this helper exists to prevent)', () => {
    for (const input of [undefined, null, '', 'abc', 'NaN', '1e', [], {}]) {
      expect(Number.isNaN(parsePositiveInt(input, 20, 100))).toBe(false);
    }
  });

  it('rejects zero and negative values', () => {
    expect(parsePositiveInt('0', 20, 100)).toBe(20);
    expect(parsePositiveInt('-5', 20, 100)).toBe(20);
  });

  it('clamps values above the maximum', () => {
    expect(parsePositiveInt('5000', 20, 100)).toBe(100);
  });

  it('does not clamp values below the maximum', () => {
    expect(parsePositiveInt('99', 20, 100)).toBe(99);
  });

  it('uses the first element when an array is supplied', () => {
    expect(parsePositiveInt(['30', '40'], 20, 100)).toBe(30);
  });

  it('falls back when the array is empty', () => {
    expect(parsePositiveInt([], 20, 100)).toBe(20);
  });

  it('accepts a raw number', () => {
    expect(parsePositiveInt(42, 20, 100)).toBe(42);
  });

  it('truncates fractional input', () => {
    expect(parsePositiveInt('12.9', 20, 100)).toBe(12);
  });

  it('parses a leading integer out of mixed input', () => {
    expect(parsePositiveInt('15abc', 20, 100)).toBe(15);
  });

  it('always returns an integer', () => {
    const result = parsePositiveInt('7.5', 20, 100);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('applies the fallback when the maximum itself is the bound', () => {
    expect(parsePositiveInt('100', 20, 100)).toBe(100);
  });
});
