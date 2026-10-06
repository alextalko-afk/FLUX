import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useI18n } from '../../hooks/useI18n';
import { useAuthStore } from '../../stores/auth.store';
import { getAutoLockMinutes, hasPasscode, removePasscode, verifyPasscode } from './passcode';
import { useLockStore } from './lock.store';

const unlockedKey = (userId: string) => `flux.unlocked.${userId}`;

function markUnlocked(userId: string): void {
  try {
    sessionStorage.setItem(unlockedKey(userId), '1');
  } catch {
    // ignore
  }
}

// A sign-in just happened in this tab: the person typed their password a moment ago,
// so the passcode is only asked for after a reload or inactivity, not right after login.
useAuthStore.subscribe((state, previous) => {
  if (!previous.isAuthenticated && state.isAuthenticated && !previous.accessToken && state.user?.id) {
    markUnlocked(state.user.id);
  }
});

/** Covers the app with a PIN screen after a reload or a period of inactivity. */
export function AppLock({ children }: { children: ReactNode }) {
  const userId = useAuthStore((state) => state.user?.id);
  const { locked, lock, unlock } = useLockStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const lastActivity = useRef(Date.now());
  const hiddenAt = useRef<number | null>(null);

  // Lock on start when a passcode exists and this tab has not been unlocked yet.
  useEffect(() => {
    if (!userId || !hasPasscode(userId)) return;
    let unlockedHere = false;
    try {
      unlockedHere = sessionStorage.getItem(unlockedKey(userId)) === '1';
    } catch {
      // ignore
    }
    if (!unlockedHere) lock();
  }, [userId, lock]);

  // Inactivity and tab-hidden timers.
  useEffect(() => {
    if (!userId) return;
    const touch = () => {
      lastActivity.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));

    const limit = () => (hasPasscode(userId) ? getAutoLockMinutes(userId) * 60_000 : null);
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        return;
      }
      const max = limit();
      if (max && hiddenAt.current && Date.now() - hiddenAt.current > max) lock();
      hiddenAt.current = null;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const timer = window.setInterval(() => {
      const max = limit();
      if (max && Date.now() - lastActivity.current > max) lock();
    }, 10_000);

    return () => {
      events.forEach((name) => window.removeEventListener(name, touch));
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [userId, lock]);

  // Keep the app underneath out of reach of keyboard and screen readers while locked.
  const showLock = locked && Boolean(userId) && hasPasscode(userId ?? '');
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (showLock) root.setAttribute('inert', '');
    else root.removeAttribute('inert');
  }, [showLock]);

  return (
    <>
      <div ref={rootRef} aria-hidden={showLock || undefined}>
        {children}
      </div>
      {showLock && userId && (
        <LockScreen
          userId={userId}
          onUnlocked={() => {
            markUnlocked(userId);
            lastActivity.current = Date.now();
            unlock();
          }}
        />
      )}
    </>
  );
}

function LockScreen({ userId, onUnlocked }: { userId: string; onUnlocked: () => void }) {
  const { t } = useI18n();
  const logout = useAuthStore((state) => state.logout);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const signOut = () => {
    removePasscode(userId);
    useLockStore.getState().unlock();
    logout();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    try {
      const result = await verifyPasscode(userId, pin);
      if (result.ok) {
        onUnlocked();
        return;
      }
      setPin('');
      if (result.wiped) {
        setMessage(t('settings.lockWiped'));
        window.setTimeout(signOut, 1500);
      } else if (result.retryAfterMs > 0) {
        setMessage(t('settings.lockWait', { seconds: String(Math.ceil(result.retryAfterMs / 1000)) }));
      } else {
        setMessage(t('settings.passcodeWrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.lockTitle')}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-bg-elevated p-6"
    >
      <form onSubmit={submit} className="w-full max-w-xs space-y-4 text-center">
        <h1 className="text-lg font-semibold text-fg-primary">{t('settings.lockTitle')}</h1>
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
          placeholder={t('settings.lockEnter')}
          error={message || undefined}
        />
        <Button type="submit" className="w-full" isLoading={busy} disabled={!pin}>
          {t('settings.lockUnlock')}
        </Button>
        <button type="button" onClick={signOut} className="text-sm text-fg-secondary hover:text-fg-primary underline">
          {t('settings.lockSignOut')}
        </button>
      </form>
    </div>
  );
}
