import { describe, it, expect } from 'vitest';
import {
  parseMarkdown,
  segmentize,
  toMarkdown,
  toSafeUrl,
  withAutoEntities,
  MAX_ENTITIES,
  TextEntity,
} from '../../../apps/web/src/lib/richText';

const types = (entities: TextEntity[]) => entities.map((e) => e.type);

describe('parseMarkdown', () => {
  it('leaves plain text alone', () => {
    expect(parseMarkdown('just words')).toEqual({ text: 'just words', entities: [] });
  });

  it('turns markers into entities over the cleaned text', () => {
    const { text, entities } = parseMarkdown('a **bold** and __italic__ and ~~gone~~ and ||secret||');
    expect(text).toBe('a bold and italic and gone and secret');
    expect(entities).toEqual([
      { type: 'bold', offset: 2, length: 4 },
      { type: 'italic', offset: 11, length: 6 },
      { type: 'strikethrough', offset: 22, length: 4 },
      { type: 'spoiler', offset: 31, length: 6 },
    ]);
  });

  it('keeps code literal, so markers inside it are not formatting', () => {
    const { text, entities } = parseMarkdown('run `**not bold**` now');
    expect(text).toBe('run **not bold** now');
    expect(entities).toEqual([{ type: 'code', offset: 4, length: 12 }]);
  });

  it('handles a fenced block and drops the fence newlines', () => {
    const { text, entities } = parseMarkdown('```\nline 1\nline 2\n```');
    expect(text).toBe('line 1\nline 2');
    expect(entities).toEqual([{ type: 'pre', offset: 0, length: 13 }]);
  });

  it('supports nesting', () => {
    const { text, entities } = parseMarkdown('**bold __and italic__**');
    expect(text).toBe('bold and italic');
    expect(types(entities)).toEqual(['bold', 'italic']);
    expect(entities[0]).toMatchObject({ offset: 0, length: 15 });
    expect(entities[1]).toMatchObject({ offset: 5, length: 10 });
  });

  it('creates a link entity with a normalised URL', () => {
    const { text, entities } = parseMarkdown('see [docs](https://example.com/a) now');
    expect(text).toBe('see docs now');
    expect(entities).toEqual([{ type: 'link', offset: 4, length: 4, url: 'https://example.com/a' }]);
  });

  it.each([
    '[click](javascript:alert(1))',
    '[click](data:text/html,<b>x</b>)',
    '[click](https://user:pw@evil.test/)',
  ])('never turns the unsafe link %s into a link', (input) => {
    expect(parseMarkdown(input).entities.some((e) => e.type === 'link')).toBe(false);
  });

  it('keeps unclosed or empty markers as typed', () => {
    expect(parseMarkdown('2 ** 3')).toEqual({ text: '2 ** 3', entities: [] });
    expect(parseMarkdown('half **open')).toEqual({ text: 'half **open', entities: [] });
    expect(parseMarkdown('****')).toEqual({ text: '****', entities: [] });
  });

  it('lets a backslash escape a marker', () => {
    expect(parseMarkdown('\\*\\*literal\\*\\*')).toEqual({ text: '**literal**', entities: [] });
  });

  it('never produces more entities than the server accepts', () => {
    const many = Array.from({ length: MAX_ENTITIES + 50 }, () => '**x**').join(' ');
    expect(parseMarkdown(many).entities.length).toBe(MAX_ENTITIES);
  });

  it('uses UTF-16 offsets so astral characters line up with String.slice', () => {
    const { text, entities } = parseMarkdown('😀 **hi**');
    const [bold] = entities;
    expect(text.slice(bold!.offset, bold!.offset + bold!.length)).toBe('hi');
  });
});

describe('toMarkdown', () => {
  const roundTrip = (input: string) => {
    const first = parseMarkdown(input);
    const back = toMarkdown(first.text, first.entities);
    return { first, second: parseMarkdown(back) };
  };

  it.each([
    'plain text',
    '**bold** and __italic__',
    '**bold __nested__ done**',
    'a `code` b',
    '||spoiler|| and ~~strike~~',
    'see [docs](https://example.com/) ok',
    '```\nblock\nof code\n```',
  ])('survives parse -> edit -> parse for %j', (input) => {
    const { first, second } = roundTrip(input);
    expect(second.text).toBe(first.text);
    expect(second.entities).toEqual(first.entities);
  });

  it('escapes literal markup characters so editing does not format them', () => {
    const { first, second } = roundTrip('\\*\\*literal\\*\\* and \\[brackets\\]');
    expect(first.text).toBe('**literal** and [brackets]');
    expect(second.text).toBe(first.text);
    expect(second.entities).toEqual([]);
  });

  it('ignores entities that fall outside the text', () => {
    expect(toMarkdown('hi', [{ type: 'bold', offset: 0, length: 9 }])).toBe('hi');
  });

  it('returns the text unchanged when there are no entities', () => {
    expect(toMarkdown('plain', null)).toBe('plain');
    expect(toMarkdown('plain', undefined)).toBe('plain');
  });
});

describe('withAutoEntities', () => {
  it('detects bare links and trims trailing punctuation', () => {
    const text = 'visit https://example.com/page, please';
    const links = withAutoEntities(text).filter((e) => e.type === 'link');
    expect(links).toHaveLength(1);
    expect(text.slice(links[0]!.offset, links[0]!.offset + links[0]!.length)).toBe(
      'https://example.com/page',
    );
  });

  it('detects @mentions and #hashtags, including non-latin hashtags', () => {
    const text = 'hi @alice_01 see #news and #новости';
    const found = withAutoEntities(text);
    const slice = (e: TextEntity) => text.slice(e.offset, e.offset + e.length);
    expect(found.filter((e) => e.type === 'mention').map(slice)).toEqual(['@alice_01']);
    expect(found.filter((e) => e.type === 'hashtag').map(slice)).toEqual(['#news', '#новости']);
  });

  it('does not treat an e-mail address as a mention', () => {
    expect(withAutoEntities('write to bob@example.com').some((e) => e.type === 'mention')).toBe(false);
  });

  it('leaves code, preformatted text and explicit links alone', () => {
    const text = 'https://a.example #tag @user';
    const guarded = withAutoEntities(text, [{ type: 'code', offset: 0, length: text.length }]);
    expect(guarded.filter((e) => e.type !== 'code')).toEqual([]);

    const explicit = withAutoEntities('https://a.example', [
      { type: 'link', offset: 0, length: 17, url: 'https://a.example/' },
    ]);
    expect(explicit).toHaveLength(1);
  });

  it('never links an unsafe scheme', () => {
    expect(withAutoEntities('javascript:alert(1) and data:text/html,x').some((e) => e.type === 'link')).toBe(false);
  });
});

describe('segmentize', () => {
  it('returns one unstyled segment for plain text', () => {
    expect(segmentize('hello')).toEqual([{ text: 'hello', styles: [] }]);
  });

  it('splits at entity boundaries and keeps nested styles together', () => {
    const segments = segmentize('abcdef', [
      { type: 'bold', offset: 0, length: 4 },
      { type: 'italic', offset: 2, length: 4 },
    ]);
    expect(segments.map((s) => s.text)).toEqual(['ab', 'cd', 'ef']);
    expect(segments.map((s) => types(s.styles))).toEqual([['bold'], ['bold', 'italic'], ['italic']]);
  });

  it('skips entities that do not fit the text instead of throwing', () => {
    expect(segmentize('abc', [{ type: 'bold', offset: 2, length: 10 }])).toEqual([
      { text: 'abc', styles: [] },
    ]);
  });

  it('covers the whole text exactly once', () => {
    const text = 'one two three';
    const segments = segmentize(text, [
      { type: 'bold', offset: 0, length: 3 },
      { type: 'code', offset: 4, length: 3 },
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });
});

describe('toSafeUrl', () => {
  it('accepts http, https and mailto', () => {
    expect(toSafeUrl('https://example.com')).toBe('https://example.com/');
    expect(toSafeUrl('mailto:a@example.com')).toBe('mailto:a@example.com');
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'https://u:p@example.com', ''])(
    'rejects %j',
    (value) => {
      expect(toSafeUrl(value)).toBeNull();
    },
  );
});
