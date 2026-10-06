import { Outlet } from 'react-router-dom';
import { SUPPORTED_LOCALES, LOCALE_LABELS } from '../../stores/locale.store';
import { useI18n } from '../../hooks/useI18n';

export function AuthLayout() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg-app p-4 overflow-hidden">
      {/* Layered backdrop: a fine grid gives depth, two large accent glows
          tinted with the theme colour keep it from looking like flat CSS. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgb(var(--color-fg-tertiary) / 0.16) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--color-fg-tertiary) / 0.16) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(70% 60% at 50% 40%, #000 40%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(70% 60% at 50% 40%, #000 40%, transparent 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 w-[34rem] h-[34rem] rounded-full bg-fg-accent/20 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 w-[32rem] h-[32rem] rounded-full bg-fg-accent/15 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(var(--color-fg-accent)/0.07),transparent_60%)]"
      />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-7 animate-float-up">
          <div className="w-[4.5rem] h-[4.5rem] mb-5 animate-pop-in">
            <svg viewBox="0 0 128 128" className="w-full h-full drop-shadow-2xl">
              <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4C93FF" />
                  <stop offset="100%" stopColor="#1B4FD8" />
                </linearGradient>
                <linearGradient id="logoSheen" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
                  <stop offset="60%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect width="128" height="128" rx="32" fill="url(#logoGradient)" />
              <rect width="128" height="128" rx="32" fill="url(#logoSheen)" />
              {/* Stylised "F" built from three flowing bars. */}
              <path d="M40 34h48v12H54v10h30v12H54v26H40z" fill="#ffffff" opacity="0.97" />
              <circle cx="96" cy="96" r="7" fill="#ffffff" opacity="0.7" />
            </svg>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg-primary">
            {t('auth.appName')}
          </h1>
          <p className="text-sm text-fg-secondary mt-1.5">{t('auth.tagline')}</p>
        </div>

        <div
          className="bg-bg-panel/70 backdrop-blur-2xl border border-border/60 rounded-2xl p-7 animate-slide-up"
          style={{
            boxShadow: 'var(--shadow-float), inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
            animationDelay: '0.1s',
          }}
        >
          <Outlet />
        </div>

        {/* Language switcher: users can read the app before signing in. */}
        <div
          className="mt-6 flex items-center justify-center gap-1.5 animate-fade-in"
          style={{ animationDelay: '0.25s' }}
        >
          {SUPPORTED_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              className={
                locale === code
                  ? 'px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-fg-accent text-fg-on-accent shadow-accent transition-all duration-200 ease-spring'
                  : 'px-3.5 py-1.5 rounded-lg text-sm text-fg-secondary hover:bg-bg-hover hover:text-fg-primary transition-all duration-200 ease-spring'
              }
              aria-pressed={locale === code}
            >
              {LOCALE_LABELS[code]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
