import { describe, it, expect } from 'vitest';
import { normalizeUserText, toSafeLinkUrl } from '../../../apps/server/src/common/utils/sanitize-text';
import { validateEntities } from '../../../apps/server/src/messages/entities.util';

describe('normalizeUserText', () => {
  it('keeps ordinary text, emoji and non-latin scripts untouched', () => {
    expect(normalizeUserText('Привет, мир 👋 – 你好')).toBe('Привет, мир 👋 – 你好');
  });

  it('keeps tabs and newlines but unifies line endings', () => {
    expect(normalizeUserText('a\tb\r\nc\rd\ne')).toBe('a\tb\nc\nd\ne');
  });

  it('removes NUL and other control characters', () => {
    expect(normalizeUserText('a\u0000b\u0007c\u007Fd\u0085e')).toBe('abcde');
  });

  it('removes bidi override characters used for spoofing', () => {
    expect(normalizeUserText('photo‮gpj.exe')).toBe('photogpj.exe');
    expect(normalizeUserText('x⁦y⁩z')).toBe('xyz');
  });

  it('keeps the zero-width joiner that emoji sequences depend on', () => {
    const family = '👨‍👩‍👧';
    expect(normalizeUserText(family)).toBe(family);
  });

  it('normalises to NFC', () => {
    expect(normalizeUserText('é')).toBe('é');
  });

  it('does not HTML-escape: text is rendered as text, never as markup', () => {
    expect(normalizeUserText('<b>1 & 2</b>')).toBe('<b>1 & 2</b>');
  });
});

describe('toSafeLinkUrl', () => {
  it.each([
    ['https://example.com/a?b=1#c', 'https://example.com/a?b=1#c'],
    ['http://example.com', 'http://example.com/'],
    ['mailto:someone@example.com', 'mailto:someone@example.com'],
    ['  https://example.com  ', 'https://example.com/'],
  ])('accepts %s', (input, expected) => {
    expect(toSafeLinkUrl(input)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'https://user:secret@example.com/',
    'example.com',
    '//example.com',
    '',
  ])('rejects %s', (input) => {
    expect(toSafeLinkUrl(input)).toBeNull();
  });

  it('rejects absurdly long URLs', () => {
    expect(toSafeLinkUrl(`https://example.com/${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('validateEntities', () => {
  it('returns an empty list when there are no entities', () => {
    expect(validateEntities('hello', undefined)).toEqual([]);
    expect(validateEntities('hello', [])).toEqual([]);
  });

  it('orders entities by position and keeps the longer span first on a tie', () => {
    const result = validateEntities('hello world', [
      { type: 'bold', offset: 6, length: 5 },
      { type: 'italic', offset: 0, length: 2 },
      { type: 'code', offset: 0, length: 5 },
    ]);
    expect(result.map((e) => e.type)).toEqual(['code', 'italic', 'bold']);
  });

  it('rejects a span that runs past the end of the text', () => {
    expect(() => validateEntities('hi', [{ type: 'bold', offset: 0, length: 3 }])).toThrow();
    expect(() => validateEntities('hi', [{ type: 'bold', offset: 2, length: 1 }])).toThrow();
  });

  it('rejects empty spans', () => {
    expect(() => validateEntities('hi', [{ type: 'bold', offset: 0, length: 0 }])).toThrow();
  });

  it('normalises link URLs and refuses unsafe ones', () => {
    const [link] = validateEntities('site', [
      { type: 'link', offset: 0, length: 4, url: 'https://example.com' },
    ]);
    expect(link.url).toBe('https://example.com/');

    expect(() =>
      validateEntities('site', [{ type: 'link', offset: 0, length: 4, url: 'javascript:alert(1)' }]),
    ).toThrow();
    expect(() => validateEntities('site', [{ type: 'link', offset: 0, length: 4 }])).toThrow();
  });

  it('refuses a URL on a non-link entity', () => {
    expect(() =>
      validateEntities('site', [{ type: 'bold', offset: 0, length: 4, url: 'https://example.com' }]),
    ).toThrow();
  });
});
