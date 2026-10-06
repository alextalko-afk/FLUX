import type { Locale } from '../stores/locale.store';

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

/**
 * Compact relative time for list rows: `now`, `5m`, `3h`, `2д`, `12 Aug`.
 * Uses `Intl` so the output matches the active interface language.
 */
export function formatRelativeShort(date: Date, locale: Locale, now = Date.now()): string {
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) return locale === 'ru' ? 'сейчас' : 'now';

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (absSeconds >= secondsInUnit) {
      return formatter.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }

  return formatter.format(diffSeconds, 'second');
}

/** Longer form used on settings screens: "5 minutes ago". */
export function formatRelative(date: Date, locale: Locale, now = Date.now()): string {
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return formatter.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }

  return formatter.format(diffSeconds, 'second');
}

const timeFormatters = new Map<Locale, Intl.DateTimeFormat>();

/**
 * Clock time of a message in the interface language.
 *
 * Uses `Intl` so English gets `2:05 PM` while Russian gets `14:05`, instead of
 * the hardcoded 24-hour pattern that used to ignore the active locale.
 */
export function formatTime(date: Date, locale: Locale): string {
  let formatter = timeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    timeFormatters.set(locale, formatter);
  }
  return formatter.format(date);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** `true` when the two dates fall on different calendar days. */
export function isDifferentDay(a: Date, b: Date): boolean {
  return startOfDay(a) !== startOfDay(b);
}

/**
 * Sticky separator label between message groups: "Today" / "Yesterday" /
 * "12 March 2026", resolved through `Intl` for the active language.
 */
export function formatDaySeparator(date: Date, locale: Locale, now = new Date()): string {
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) return locale === 'ru' ? 'Сегодня' : 'Today';
  if (dayDiff === 1) return locale === 'ru' ? 'Вчера' : 'Yesterday';

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: dayDiff > 300 ? 'numeric' : undefined,
  }).format(date);
}

/** Full timestamp for message tooltips. */
export function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
/** Chat list timestamp, Telegram style: the time today, the weekday this week, otherwise the date. */
export function formatChatListTime(date: Date, locale: Locale, now = Date.now()): string {
  const current = new Date(now);
  const startOfToday = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const dayMs = 24 * 3600 * 1000;
  if (date.getTime() >= startOfToday) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (date.getTime() >= startOfToday - 6 * dayMs) return date.toLocaleDateString(locale, { weekday: 'short' });
  const sameYear = date.getFullYear() === current.getFullYear();
  return date.toLocaleDateString(locale, sameYear ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;

/** A message made only of one to three emoji is shown large, like an animated sticker. */
export function isEmojiOnly(text: string | null | undefined): boolean {
  return !!text && EMOJI_ONLY.test(text.trim());
}
