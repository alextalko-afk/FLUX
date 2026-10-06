import { NavLink, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  useThemeStore,
  FONT_STACKS,
  type Accent,
  type Theme,
  type Wallpaper,
  type FontFamily,
  type FontScale,
} from '../stores/theme.store';
import { SUPPORTED_LOCALES, LOCALE_LABELS } from '../stores/locale.store';
import { useI18n } from '../hooks/useI18n';
import { Tabs } from '../components/ui/Tabs';
import { SettingsRow, SettingsSection, Switch } from '../components/ui/Settings';
import { ProfileEditor } from '../features/settings/components/ProfileEditor';
import { PasscodeSettings } from '../features/settings/components/PasscodeSettings';
import { BotsSettings } from '../features/settings/components/BotsSettings';
import { TwoFactor } from '../features/settings/components/TwoFactor';
import { DesktopAutostart } from '../features/settings/components/DesktopAutostart';
import { ChangePassword } from '../features/settings/components/ChangePassword';
import { Sessions } from '../features/settings/components/Sessions';
import { AccountData } from '../features/settings/components/AccountData';
import { Privacy } from '../features/settings/components/Privacy';
import { NotificationSettings } from '../features/settings/components/NotificationSettings';
import { PrivacyPreferences } from '../features/settings/components/PrivacyPreferences';

type SectionId =
  | 'general'
  | 'appearance'
  | 'notifications'
  | 'privacy'
  | 'security'
  | 'bots'
  | 'language'
  | 'about';

const SECTION_ICONS: Record<SectionId, string> = {
  general: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  appearance:
    'M12 3a9 9 0 1 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1a1.49 1.49 0 0 1-.36-1.06c0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-7.94-9-7.94z',
  notifications:
    'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  privacy: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  security: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  bots: 'M12 8V4H8M4 12a8 8 0 0 1 16 0v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM9 15h.01M15 15h.01',
  language: 'M4 5h16M9 3v2m4 12l4-9-4-9m-4 18l4-9',
  about: 'M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
};

const THEME_OPTIONS: { id: Theme; key: string }[] = [
  { id: 'light', key: 'settings.themeLight' },
  { id: 'dark', key: 'settings.themeDark' },
  { id: 'system', key: 'settings.themeSystem' },
];

const ACCENTS: { id: Accent; color: string }[] = [
  { id: 'blue', color: 'rgb(46 124 246)' },
  { id: 'indigo', color: 'rgb(108 124 255)' },
  { id: 'violet', color: 'rgb(167 130 255)' },
  { id: 'emerald', color: 'rgb(52 199 143)' },
  { id: 'rose', color: 'rgb(244 120 150)' },
  { id: 'amber', color: 'rgb(245 178 76)' },
];

const WALLPAPERS: { id: Wallpaper; label: string }[] = [
  { id: 'dots', label: '•••' },
  { id: 'grid', label: '▦' },
  { id: 'none', label: '—' },
];

const FONT_OPTIONS: { id: FontFamily; key: string }[] = [
  { id: 'system', key: 'settings.fontSystem' },
  { id: 'inter', key: 'settings.fontInter' },
  { id: 'rounded', key: 'settings.fontRounded' },
  { id: 'serif', key: 'settings.fontSerif' },
  { id: 'mono', key: 'settings.fontMono' },
];

const FONT_SCALE_OPTIONS: { id: FontScale; key: string }[] = [
  { id: 'sm', key: 'settings.fontSizeSmall' },
  { id: 'md', key: 'settings.fontSizeMedium' },
  { id: 'lg', key: 'settings.fontSizeLarge' },
  { id: 'xl', key: 'settings.fontSizeHuge' },
];

export function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { t, locale, setLocale } = useI18n();
  const {
    theme,
    accent,
    wallpaper,
    fontFamily,
    fontScale,
    compact,
    enterToSend,
    setTheme,
    setAccent,
    setWallpaper,
    setFontFamily,
    setFontScale,
    setCompact,
    setEnterToSend,
  } = useThemeStore();

  const activeSection = (section || 'general') as SectionId;

  const sections: { id: SectionId; label: string }[] = [
    { id: 'general', label: t('settings.account') },
    { id: 'appearance', label: t('settings.appearance') },
    { id: 'notifications', label: t('settings.notifications') },
    { id: 'privacy', label: t('settings.privacy') },
    { id: 'security', label: t('settings.security') },
    { id: 'bots', label: t('bots.title') },
    { id: 'language', label: t('settings.language') },
    { id: 'about', label: t('settings.about') },
  ];

  return (
    <div className="flex h-full">
      {/* Section navigation: grouped, icon-driven, with a spring-highlighted active item. */}
      <nav className="hidden md:flex w-64 flex-col border-r border-border bg-bg-panel p-3 overflow-y-auto">
        <h2 className="px-3 py-2 mb-2 text-lg font-semibold text-fg-primary">
          {t('settings.title')}
        </h2>
        <ul className="space-y-1 flex-1">
          {sections.map((s) => (
            <li key={s.id}>
              <NavLink
                to={`/settings/${s.id}`}
                className={({ isActive }) =>
                  clsx(
                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ease-spring',
                    isActive
                      ? 'bg-bg-active text-fg-primary shadow-panel'
                      : 'text-fg-secondary hover:bg-bg-hover hover:text-fg-primary hover:translate-x-0.5',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-fg-accent"
                      />
                    )}
                    <svg
                      className="w-5 h-5 flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d={SECTION_ICONS[s.id]} />
                    </svg>
                    <span>{s.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 overflow-y-auto">
        {/* On small screens the same sections become a scrollable tab strip. */}
        <div className="md:hidden sticky top-0 z-10 bg-bg-app/90 backdrop-blur border-b border-border p-3 overflow-x-auto">
          <Tabs
            items={sections}
            value={activeSection}
            onChange={(id) => navigate(`/settings/${id}`)}
            ariaLabel={t('settings.title')}
          />
        </div>

        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {activeSection === 'general' && (
            <SettingsSection title={t('settings.account')}>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <ProfileEditor />
              </div>
            </SettingsSection>
          )}

          {activeSection === 'appearance' && (
            <SettingsSection
              title={t('settings.appearance')}
              description={t('settings.accentHint')}
            >
              <SettingsRow
                icon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8l1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M17 6.4l1.4-1.4" />
                  </svg>
                }
                title={t('settings.theme')}
              >
                <Tabs
                  items={THEME_OPTIONS.map((o) => ({ id: o.id, label: t(o.key) }))}
                  value={theme}
                  onChange={setTheme}
                  ariaLabel={t('settings.theme')}
                />
              </SettingsRow>

              <SettingsRow
                icon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="13.5" cy="6.5" r="1.5" />
                    <circle cx="17.5" cy="10.5" r="1.5" />
                    <circle cx="8.5" cy="7.5" r="1.5" />
                    <circle cx="6.5" cy="12.5" r="1.5" />
                    <path d="M12 2a10 10 0 1 0 0 20c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1-.24-.26-.39-.6-.39-1 0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-7.94-9-7.94z" />
                  </svg>
                }
                title={t('settings.accent')}
                description={t('settings.accentHint')}
              >
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAccent(a.id)}
                      aria-label={a.id}
                      aria-pressed={accent === a.id}
                      className={clsx(
                        'w-7 h-7 rounded-full transition-all duration-200 ease-spring',
                        accent === a.id
                          ? 'scale-110 ring-2 ring-offset-2 ring-offset-bg-panel ring-fg-accent'
                          : 'hover:scale-110',
                      )}
                      style={{ backgroundColor: a.color }}
                    />
                  ))}
                </div>
              </SettingsRow>

              <SettingsRow
                icon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 7 4 4 20 4 20 7" />
                    <line x1="9" y1="20" x2="15" y2="20" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                }
                title={t('settings.fontFamily')}
                description={t('settings.fontFamilyHint')}
              >
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {FONT_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFontFamily(f.id)}
                      aria-label={t(f.key)}
                      aria-pressed={fontFamily === f.id}
                      title={t(f.key)}
                      className={clsx(
                        'w-11 h-11 rounded-xl border text-lg flex items-center justify-center',
                        'transition-all duration-200 ease-spring',
                        fontFamily === f.id
                          ? 'bg-fg-accent/10 border-fg-accent/50 text-fg-primary shadow-panel scale-105'
                          : 'bg-bg-app border-border text-fg-secondary hover:border-fg-accent/40 hover:text-fg-primary',
                      )}
                      style={{ fontFamily: FONT_STACKS[f.id] }}
                    >
                      Aa
                    </button>
                  ))}
                </div>
              </SettingsRow>

              <SettingsRow
                icon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 7 3 5 21 5 21 7" />
                    <polyline points="9 19 9 12 15 12 15 19" />
                    <line x1="12" y1="5" x2="12" y2="12" />
                  </svg>
                }
                title={t('settings.fontSize')}
                description={t('settings.fontSizeHint')}
              >
                <Tabs
                  items={FONT_SCALE_OPTIONS.map((o) => ({ id: o.id, label: t(o.key) }))}
                  value={fontScale}
                  onChange={setFontScale}
                  ariaLabel={t('settings.fontSize')}
                />
              </SettingsRow>

              <SettingsRow
                title={t('settings.wallpaper')}
                description={t('settings.wallpaperHint')}
              >
                <Tabs
                  items={WALLPAPERS}
                  value={wallpaper}
                  onChange={setWallpaper}
                  ariaLabel={t('settings.wallpaper')}
                />
              </SettingsRow>

              <SettingsRow title={t('settings.compact')} description={t('settings.compactHint')}>
                <Switch checked={compact} onChange={setCompact} label={t('settings.compact')} />
              </SettingsRow>

              <SettingsRow
                title={t('settings.enterToSend')}
                description={t('settings.enterToSendHint')}
              >
                <Switch
                  checked={enterToSend}
                  onChange={setEnterToSend}
                  label={t('settings.enterToSend')}
                />
              </SettingsRow>
            </SettingsSection>
          )}

          {activeSection === 'notifications' && (
            <SettingsSection title={t('settings.notifications')}>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <NotificationSettings />
              </div>
              <DesktopAutostart />
            </SettingsSection>
          )}

          {activeSection === 'privacy' && (
            <div className="space-y-4">
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <PrivacyPreferences />
              </div>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <Privacy />
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <SettingsSection title={t('settings.security')}>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <TwoFactor />
              </div>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <ChangePassword />
              </div>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <PasscodeSettings />
              </div>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <Sessions />
              </div>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
                <AccountData />
              </div>
            </SettingsSection>
          )}

          {activeSection === 'bots' && (
            <SettingsSection title={t('bots.title')}>
              <BotsSettings />
            </SettingsSection>
          )}

          {activeSection === 'language' && (
            <SettingsSection
              title={t('settings.language')}
              description={t('settings.languageHint')}
            >
              <SettingsRow title={t('settings.language')}>
                <Tabs
                  items={SUPPORTED_LOCALES.map((code) => ({
                    id: code,
                    label: LOCALE_LABELS[code],
                  }))}
                  value={locale}
                  onChange={setLocale}
                  ariaLabel={t('settings.language')}
                />
              </SettingsRow>
            </SettingsSection>
          )}

          {activeSection === 'about' && (
            <SettingsSection title={t('settings.about')}>
              <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4 space-y-3 text-sm text-fg-secondary">
                <p>
                  <strong className="text-fg-primary">{t('auth.appName')}</strong> —{' '}
                  {t('settings.aboutText1')}
                </p>
                <p>{t('settings.aboutText2')}</p>
                <p className="text-xs text-fg-tertiary">
                  {t('settings.version', { version: '1.0.0' })}
                </p>
              </div>
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}
