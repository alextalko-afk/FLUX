import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';

/**
 * Public "Legal & About" page.
 *
 * Deliberately reachable without authentication (see `App.tsx`, where it is
 * registered outside the auth-gated route tree) so that a visitor can read the
 * terms and the disclaimer before creating an account.
 *
 * The text is bundled through i18n rather than hard-coded so the Russian and
 * English versions stay in sync.
 */
export function LegalPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-bg-app text-fg-primary">
      <header className="border-b border-border bg-bg-panel/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <svg viewBox="0 0 128 128" className="h-10 w-10 rounded-xl">
            <defs>
              <linearGradient id="legalLogo" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4C93FF" />
                <stop offset="100%" stopColor="#1B4FD8" />
              </linearGradient>
            </defs>
            <rect width="128" height="128" rx="30" fill="url(#legalLogo)" />
            <path d="M40 34h48v12H54v10h30v12H54v26H40z" fill="#ffffff" opacity="0.96" />
          </svg>
          <div className="flex-1">
            <div className="text-lg font-semibold">{t('legal.appName')}</div>
            <div className="text-xs text-fg-secondary">{t('legal.tagline')}</div>
          </div>
          <Link
            to="/login"
            className="text-sm font-medium text-fg-accent hover:underline"
          >
            {t('legal.backToApp')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">{t('legal.title')}</h1>
          <p className="text-sm text-fg-secondary">{t('legal.intro')}</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('legal.aboutTitle')}</h2>
          <p className="text-sm leading-6 text-fg-secondary">{t('legal.aboutText')}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('legal.termsTitle')}</h2>
          <p className="text-sm leading-6 text-fg-secondary">{t('legal.termsText')}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('legal.privacyTitle')}</h2>
          <p className="text-sm leading-6 text-fg-secondary">{t('legal.privacyText')}</p>
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-bg-panel p-4">
          <h2 className="text-lg font-semibold">{t('legal.disclaimerTitle')}</h2>
          <p className="text-sm leading-6 text-fg-secondary">{t('legal.disclaimerText')}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('legal.contactTitle')}</h2>
          <p className="text-sm leading-6 text-fg-secondary">{t('legal.contactText')}</p>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto max-w-3xl text-xs text-fg-tertiary">
          {t('legal.footer', { year: new Date().getFullYear() })}
        </div>
      </footer>
    </div>
  );
}
