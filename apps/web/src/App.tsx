import { LoginQrPage } from './pages/LoginQrPage';
import { QrApprovePage } from './pages/QrApprovePage';
import { AppLock } from './features/lock/AppLock';
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { useI18n } from './hooks/useI18n';
import { useThemeStore } from './stores/theme.store';
import { useLocaleStore } from './stores/locale.store';
import { AuthLayout } from './components/layout/AuthLayout';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { JoinPage } from './pages/JoinPage';
import { ChatsPage } from './pages/ChatsPage';
import { ChatInfoPage } from './pages/ChatInfoPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { NewChatPage } from './pages/NewChatPage';
import { SearchPage } from './pages/SearchPage';
import { ContactsPage } from './pages/ContactsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';
import { LegalPage } from './pages/LegalPage';
import { NotFoundPage } from './pages/NotFoundPage';

const REDIRECT_KEY = 'flux:redirectAfterLogin';

/** Stores the invite URL, then sends the visitor to the sign-in page. */
function RememberAndLogin() {
  const location = useLocation();
  try {
    sessionStorage.setItem(REDIRECT_KEY, location.pathname);
  } catch {
    // Storage blocked: the visitor just has to open the link again after signing in.
  }
  return <Navigate to="/login" replace />;
}

/** After sign-in, resumes the page that was remembered while signed out. */
function ResumeAfterLogin() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const target = sessionStorage.getItem(REDIRECT_KEY);
      if (target) {
        sessionStorage.removeItem(REDIRECT_KEY);
        navigate(target, { replace: true });
      }
    } catch {
      // ignore
    }
  }, [navigate]);

  return null;
}

export function App() {
  const { user, isAuthenticated, accessToken, hydrate } = useAuthStore();
  const { t } = useI18n();
  // Only the access token survives a reload. Until `hydrate()` has checked it,
  // `isAuthenticated` is false, and rendering the signed-out routes would
  // redirect every deep link (`/chats/123`, `/settings/security`) to `/login`.
  const [isHydrating, setIsHydrating] = useState(Boolean(accessToken));
  const {
    theme,
    accent,
    wallpaper,
    fontFamily,
    fontScale,
    compact,
    applyTheme,
    applyAccent,
    applyWallpaper,
    applyFont,
    applyCompact,
  } = useThemeStore();
  const locale = useLocaleStore((s) => s.locale);

  useEffect(() => {
    void hydrate().finally(() => setIsHydrating(false));
  }, [hydrate]);

  // Appearance preferences are applied imperatively so the first paint already
  // uses them and every component reads the theme from CSS variables.
  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  useEffect(() => {
    applyAccent(accent);
  }, [accent, applyAccent]);

  useEffect(() => {
    applyWallpaper(wallpaper);
  }, [wallpaper, applyWallpaper]);

  useEffect(() => {
    applyCompact(compact);
  }, [compact, applyCompact]);

  useEffect(() => {
    applyFont(fontFamily, fontScale);
  }, [fontFamily, fontScale, applyFont]);

  // Keeps the document language in sync for screen readers and hyphenation.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  if (isHydrating) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex items-center justify-center text-sm text-fg-secondary"
      >
        {t('common.loading')}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        {/* Public: readable before an account exists. Must be declared before
            the catch-all below, which otherwise redirects everything to login. */}
        <Route path="/legal" element={<LegalPage />} />
        {/* An invite opened while signed out is remembered and resumed after sign-in. */}
        <Route path="/join/:token" element={<RememberAndLogin />} />
        <Route path="/qr-login" element={<QrApprovePage />} />
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/qr" element={<LoginQrPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <AppLock>
    <ResumeAfterLogin />
    <Routes>
      {/* Public even while signed in, so the footer link works from the app. */}
      <Route path="/legal" element={<LegalPage />} />
      <Route path="/qr-login" element={<QrApprovePage />} />
      <Route element={<AppLayout />}>
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chats/new" element={<NewChatPage />} />
        <Route path="/chats/:chatId" element={<ChatsPage />} />
        <Route path="/chats/:chatId/info" element={<ChatInfoPage />} />
        <Route path="/u/:userId" element={<UserProfilePage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        {user?.role === 'ADMIN' && (
          <>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/:section" element={<AdminPage />} />
          </>
        )}
        {/* A signed-in user who lands on a sign-in page goes straight to the app. */}
        {['/login', '/login/qr', '/register', '/verify', '/forgot-password'].map((path) => (
          <Route key={path} path={path} element={<Navigate to="/chats" replace />} />
        ))}
        <Route path="/" element={<Navigate to="/chats" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </AppLock>
  );
}
