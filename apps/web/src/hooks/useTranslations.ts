import { useCallback, useMemo } from 'react';
import { en, type Dictionary } from '../locales/en';
import { ru } from '../locales/ru';
import { useLocaleStore, type Locale } from '../stores/locale.store';

export type { Locale };

export type TParams = Record<string, string | number>;

const dictionaries: Record<Locale, Dictionary> = { en, ru };

/** Walks `a.b.c` through the nested dictionary. */
function lookup(dict: Dictionary, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
      dict,
  );
}

/**
 * Plural forms are stored as suffixed keys (`members_one`, `members_many`, …),
 * so a plural lookup targets the section that owns the base key.
 */
function lookupPluralSet(
  dict: Dictionary,
  key: string,
  count: number,
  locale: Locale,
): string | undefined {
  const section = key.slice(0, key.lastIndexOf('.'));
  const base = key.slice(key.lastIndexOf('.') + 1);
  const scope = section ? lookup(dict, section) : dict;

  if (!scope || typeof scope !== 'object') return undefined;

  const form = new Intl.PluralRules(locale).select(count);
  const bucket = scope as Record<string, unknown>;

  return (
    (typeof bucket[`${base}_${form}`] === 'string' ? (bucket[`${base}_${form}`] as string) : undefined) ??
    (typeof bucket[`${base}_other`] === 'string' ? (bucket[`${base}_other`] as string) : undefined)
  );
}

/** Replaces `{placeholder}` tokens with the matching parameter. */
function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Resolves a dot-path key. When `count` is present in the params, a plural
 * variant is preferred over the plain string.
 */
export function translate(
  locale: Locale,
  dict: Dictionary,
  key: string,
  params?: TParams,
): string {
  const value = lookup(dict, key);

  if (typeof value === 'string') {
    return interpolate(value, params);
  }

  if (params && params.count !== undefined) {
    const plural = lookupPluralSet(dict, key, Number(params.count), locale);
    if (plural) return interpolate(plural, params);
  }

  // Missing key: returning the key makes the gap obvious instead of silent.
  return key;
}

export function useI18n() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const dict = dictionaries[locale] ?? en;

  const t = useCallback(
    (key: string, params?: TParams) => translate(locale, dict, key, params),
    [locale, dict],
  );

  return useMemo(
    () => ({ t, locale, setLocale }),
    [t, locale, setLocale],
  );
}

export type TranslateFn = ReturnType<typeof useI18n>['t'];
