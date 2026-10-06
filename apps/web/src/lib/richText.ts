/**
 * Message formatting, independent of React so it can be unit-tested.
 *
 * A message is stored as plain `content` plus `entities`: ranges of that text
 * (UTF-16 code units, the unit `String.prototype.slice` uses) that carry a
 * style. The composer turns lightweight markup into that form, and the
 * renderer turns it back into styled text. The server validates the same
 * ranges, so what the client sends is exactly what every other client shows.
 */

export type EntityType =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'pre'
  | 'spoiler'
  | 'link'
  | 'mention'
  | 'hashtag';

export interface TextEntity {
  type: EntityType;
  offset: number;
  length: number;
  url?: string;
}

/** The server accepts at most this many entities per message. */
export const MAX_ENTITIES = 200;

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Returns the normalised URL when it is an http(s)/mailto link without
 * embedded credentials, otherwise `null`. A `javascript:` or `data:` URL must
 * never reach an `href`.
 */
export function toSafeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// Markup -> text + entities
// ---------------------------------------------------------------------------

interface Marker {
  open: string;
  type: EntityType;
  /** Literal markers keep their content verbatim (no nested formatting). */
  literal?: boolean;
}

// Longer markers first so "```" is not read as three single backticks.
const MARKERS: Marker[] = [
  { open: '```', type: 'pre', literal: true },
  { open: '`', type: 'code', literal: true },
  { open: '**', type: 'bold' },
  { open: '__', type: 'italic' },
  { open: '~~', type: 'strikethrough' },
  { open: '||', type: 'spoiler' },
];

const ESCAPABLE = '\\*_~|`[]()';
const LINK_PATTERN = /^\[([^\]\n]+)\]\(([^)\s]+)\)/;

interface Output {
  text: string;
  entities: TextEntity[];
}

function parseInto(source: string, out: Output): void {
  let i = 0;

  scan: while (i < source.length) {
    const char = source[i] as string;

    // A backslash makes the next markup character literal: \*not bold\*
    if (char === '\\' && i + 1 < source.length && ESCAPABLE.includes(source[i + 1] as string)) {
      out.text += source[i + 1] as string;
      i += 2;
      continue;
    }

    if (char === '[') {
      const match = LINK_PATTERN.exec(source.slice(i));
      const url = match ? toSafeUrl(match[2] as string) : null;
      if (match && url) {
        const start = out.text.length;
        parseInto(match[1] as string, out);
        if (out.text.length > start) {
          out.entities.push({ type: 'link', offset: start, length: out.text.length - start, url });
        }
        i += match[0].length;
        continue;
      }
    }

    for (const marker of MARKERS) {
      if (!source.startsWith(marker.open, i)) continue;

      const innerStart = i + marker.open.length;
      const close = source.indexOf(marker.open, innerStart);
      // An unclosed or empty pair is just text, so "2 ** 3" stays as typed.
      if (close <= innerStart) continue;

      let inner = source.slice(innerStart, close);
      if (marker.type === 'pre') inner = inner.replace(/^\n/, '').replace(/\n$/, '');

      const start = out.text.length;
      if (marker.literal) {
        out.text += inner;
      } else {
        parseInto(inner, out);
      }

      if (out.text.length > start) {
        out.entities.push({ type: marker.type, offset: start, length: out.text.length - start });
      }
      i = close + marker.open.length;
      continue scan;
    }

    out.text += char;
    i += 1;
  }
}

/** Orders entities by position, longest first, which is what the server stores. */
export function sortEntities(entities: TextEntity[]): TextEntity[] {
  return [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length);
}

/**
 * Converts composer markup into plain text and the entities describing it.
 *
 * Supported: `**bold**`, `__italic__`, `~~strike~~`, `||spoiler||`, `` `code` ``,
 * ```` ```block``` ```` and `[label](https://link)`. Anything unclosed stays
 * literal, and a backslash escapes a marker.
 */
export function parseMarkdown(input: string): { text: string; entities: TextEntity[] } {
  const out: Output = { text: '', entities: [] };
  parseInto(input, out);
  return { text: out.text, entities: sortEntities(out.entities).slice(0, MAX_ENTITIES) };
}

// ---------------------------------------------------------------------------
// text + entities -> markup (used when editing a formatted message)
// ---------------------------------------------------------------------------

const MARKER_FOR: Partial<Record<EntityType, string>> = {
  bold: '**',
  italic: '__',
  strikethrough: '~~',
  spoiler: '||',
  code: '`',
  pre: '```',
};

const escapeMarkup = (value: string) => value.replace(/[\\*_~|`[\]()]/g, (c) => `\\${c}`);

/**
 * Inverse of {@link parseMarkdown}: puts the markup back so a formatted
 * message can be edited as text and re-parsed on save. Entities that merely
 * cross each other (which the parser never produces) are skipped.
 */
export function toMarkdown(content: string, entities: TextEntity[] | null | undefined): string {
  const valid = sortEntities(
    (entities ?? []).filter(
      (e) =>
        MARKER_FOR[e.type] !== undefined || e.type === 'link'
          ? e.length > 0 && e.offset >= 0 && e.offset + e.length <= content.length
          : false,
    ),
  );

  // Keep a properly nested subset.
  const stack: TextEntity[] = [];
  const accepted: TextEntity[] = [];
  for (const entity of valid) {
    for (let top = stack[stack.length - 1]; top && top.offset + top.length <= entity.offset; top = stack[stack.length - 1]) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent && entity.offset + entity.length > parent.offset + parent.length) continue;
    // Literal spans keep their content verbatim, so nothing may nest inside them.
    if (parent && (parent.type === 'code' || parent.type === 'pre')) continue;
    accepted.push(entity);
    stack.push(entity);
  }

  const opens = new Map<number, TextEntity[]>();
  const closes = new Map<number, TextEntity[]>();
  for (const entity of accepted) {
    (opens.get(entity.offset) ?? opens.set(entity.offset, []).get(entity.offset)!).push(entity);
    const end = entity.offset + entity.length;
    (closes.get(end) ?? closes.set(end, []).get(end)!).unshift(entity);
  }

  let literalDepth = 0;
  let result = '';
  for (let pos = 0; pos <= content.length; pos++) {
    for (const entity of closes.get(pos) ?? []) {
      if (entity.type === 'code' || entity.type === 'pre') literalDepth -= 1;
      result += entity.type === 'link' ? `](${entity.url ?? ''})` : (MARKER_FOR[entity.type] ?? '');
    }
    for (const entity of opens.get(pos) ?? []) {
      result += entity.type === 'link' ? '[' : (MARKER_FOR[entity.type] ?? '');
      if (entity.type === 'code' || entity.type === 'pre') literalDepth += 1;
    }
    if (pos < content.length) {
      const char = content[pos] as string;
      result += literalDepth > 0 ? char : escapeMarkup(char);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const URL_PATTERN = /\bhttps?:\/\/[^\s<>]+/gi;
const MENTION_PATTERN = /(^|[^\w@])@([A-Za-z0-9_]{3,32})\b/g;
const HASHTAG_PATTERN = /(^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]{1,64})/gu;
// Punctuation that usually ends a sentence rather than a link.
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/;

const overlaps = (a: TextEntity, offset: number, length: number) =>
  a.offset < offset + length && offset < a.offset + a.length;

/**
 * Adds entities for things the sender did not mark up: bare URLs, `@username`
 * mentions and `#hashtags`. They are derived at display time, never stored,
 * and never inside code, preformatted text or an explicit link.
 */
export function withAutoEntities(content: string, entities: TextEntity[] = []): TextEntity[] {
  const blocked = entities.filter((e) => e.type === 'code' || e.type === 'pre' || e.type === 'link');
  const added: TextEntity[] = [];

  const add = (entity: TextEntity) => {
    if (blocked.some((b) => overlaps(b, entity.offset, entity.length))) return;
    if (added.some((a) => overlaps(a, entity.offset, entity.length))) return;
    added.push(entity);
  };

  for (const match of content.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(TRAILING_PUNCTUATION, '');
    const url = toSafeUrl(raw);
    if (url) add({ type: 'link', offset: match.index!, length: raw.length, url });
  }

  for (const match of content.matchAll(MENTION_PATTERN)) {
    add({
      type: 'mention',
      offset: match.index! + (match[1] ?? '').length,
      length: (match[2] ?? '').length + 1,
    });
  }

  for (const match of content.matchAll(HASHTAG_PATTERN)) {
    add({
      type: 'hashtag',
      offset: match.index! + (match[1] ?? '').length,
      length: (match[2] ?? '').length + 1,
    });
  }

  return sortEntities([...entities, ...added]);
}

export interface Segment {
  text: string;
  /** Entities covering this run of text, outermost first. */
  styles: TextEntity[];
}

/**
 * Splits `content` into runs that share one set of styles, so overlapping and
 * nested entities render without any nesting logic in the view.
 * Entities that fall outside the text are ignored instead of throwing.
 */
export function segmentize(content: string, entities: TextEntity[] = []): Segment[] {
  const usable = entities.filter(
    (e) => e.length > 0 && e.offset >= 0 && e.offset + e.length <= content.length,
  );

  const cuts = new Set<number>([0, content.length]);
  for (const entity of usable) {
    cuts.add(entity.offset);
    cuts.add(entity.offset + entity.length);
  }

  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i] as number;
    const end = points[i + 1] as number;
    if (start === end) continue;

    segments.push({
      text: content.slice(start, end),
      styles: sortEntities(usable.filter((e) => e.offset <= start && e.offset + e.length >= end)),
    });
  }

  return segments;
}
