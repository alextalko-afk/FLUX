import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'blue' | 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber';
export type Wallpaper = 'dots' | 'grid' | 'none';
export type FontFamily = 'system' | 'inter' | 'rounded' | 'serif' | 'mono';
export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Real bundled families (self-hosted via @fontsource-variable), each verified
 * to include the Cyrillic subset so Russian text never falls back to a system
 * font. The trailing system stack is only a safety net.
 */
export const FONT_STACKS: Record<FontFamily, string> = {
  system:
    "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
  inter:
    "'Inter Variable', 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif",
  rounded:
    "'Manrope Variable', 'Segoe UI Variable Display', 'Trebuchet MS', ui-rounded, system-ui, sans-serif",
  serif: "'Lora Variable', Georgia, Cambria, 'Times New Roman', serif",
  mono: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

/** Root font-size multiplier; every `rem`-based Tailwind size scales with it. */
export const FONT_SCALES: Record<FontScale, string> = {
  sm: '0.9375',
  md: '1',
  lg: '1.0625',
  xl: '1.125',
};

interface ThemeState {
  theme: Theme;
  accent: Accent;
  wallpaper: Wallpaper;
  fontFamily: FontFamily;
  fontScale: FontScale;
  compact: boolean;
  enterToSend: boolean;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  setWallpaper: (wallpaper: Wallpaper) => void;
  setFontFamily: (fontFamily: FontFamily) => void;
  setFontScale: (fontScale: FontScale) => void;
  setCompact: (compact: boolean) => void;
  setEnterToSend: (enterToSend: boolean) => void;
  applyTheme: (theme: Theme) => void;
  applyAccent: (accent: Accent) => void;
  applyWallpaper: (wallpaper: Wallpaper) => void;
  applyFont: (fontFamily: FontFamily, fontScale: FontScale) => void;
  applyCompact: (compact: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      accent: 'indigo',
      wallpaper: 'dots',
      fontFamily: 'system',
      fontScale: 'md',
      compact: false,
      enterToSend: true,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setFontScale: (fontScale) => set({ fontScale }),
      setCompact: (compact) => set({ compact }),
      setEnterToSend: (enterToSend) => set({ enterToSend }),
      applyTheme: (theme) => {
        const html = document.documentElement;
        if (theme === 'system') {
          html.removeAttribute('data-theme');
        } else {
          html.setAttribute('data-theme', theme);
        }
      },
      applyAccent: (accent) => {
        document.documentElement.setAttribute('data-accent', accent);
      },
      applyWallpaper: (wallpaper) => {
        document.documentElement.setAttribute('data-wallpaper', wallpaper);
      },
      applyFont: (fontFamily, fontScale) => {
        const html = document.documentElement;
        html.style.setProperty('--font-sans', FONT_STACKS[fontFamily]);
        html.style.setProperty('--font-scale', FONT_SCALES[fontScale]);
        // The scale has to live on the root element for `rem` units to pick
        // it up; a class on <body> would only affect elements below it.
        html.style.fontSize = `calc(16px * ${FONT_SCALES[fontScale]})`;
      },
      applyCompact: (compact) => {
        document.documentElement.classList.toggle('is-compact', compact);
      },
    }),
    {
      name: 'flux-theme',
      storage: createJSONStorage(() => localStorage),
      // Bumped for the font preferences so a stale shape cannot break the app.
      version: 8,
      // v8: the midnight design. Everyone moves to the dark theme with the violet accent once;
      // both stay changeable in Settings. The short-lived `layout` option is dropped.
      migrate: (persisted) => {
        const { layout: _layout, ...rest } = persisted as Record<string, unknown>;
        return { ...rest, theme: 'dark', accent: 'indigo' } as never;
      },
    },
  ),
);
