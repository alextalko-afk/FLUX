
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Locale = 'en' | 'ru';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ru'];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
};

/**
 * Picks the best supported locale from the browser preferences.
 * Only the primary subtag is compared, so `ru-RU`, `ru-BY` all map to `ru`.
 */
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const tag of candidates) {
    const base = tag.toLowerCase().split('-')[0] as Locale;
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return 'en';
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: detectLocale(),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'flux-locale',
      storage: createJSONStorage(() => localStorage),
      version: 2,
    },
  ),
);
