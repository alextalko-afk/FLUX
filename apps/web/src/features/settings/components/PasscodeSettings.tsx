import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useI18n } from '../../../hooks/useI18n';
import { useAuthStore } from '../../../stores/auth.store';
import { useLockStore } from '../../lock/lock.store';
import {
  AUTO_LOCK_OPTIONS,
  PIN_PATTERN,
  getAutoLockMinutes,
  hasPasscode,
  removePasscode,
  setAutoLockMinutes,
  setPasscode,
  verifyPasscode,
} from '../../lock/passcode';

type Mode = 'idle' | 'set' | 'change' | 'off';

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 12);

/** Turn the app passcode on or off, change it, pick the idle time, or lock now. */
export function PasscodeSettings() {
  const { t } = useI18n();
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const lock = useLockStore((state) => state.lock);
  const [enabled, setEnabled] = useState(() => hasPasscode(userId));
  const [minutes, setMinutes] = useState(() => getAutoLockMinutes(userId));
  const [mode, setMode] = useState<Mode>('idle');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setMode('idle');
    setCurrent('');
    setNext('');
    setRepeat('');
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (mode === 'set' || mode === 'change') {
      if (!PIN_PATTERN.test(next)) return setError(t('settings.passcodeFormat'));
      if (next !== repeat) return setError(t('settings.passcodeMismatch'));
    }
    if (mode === 'change' || mode === 'off') {
      const check = await verifyPasscode(userId, current);
      if (!check.ok) return setError(t('settings.passcodeWrong'));
    }

    if (mode === 'off') {
      removePasscode(userId);
      setEnabled(false);
    } else {
      await setPasscode(userId, next, minutes);
      setEnabled(true);
      try {
        sessionStorage.setItem(`flux.unlocked.${userId}`, '1');
      } catch {
        // ignore
      }
    }
    toast.success(t('settings.passcodeSaved'));
    reset();
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold text-fg-primary">{t('settings.passcode')}</div>
        <div className="text-xs text-fg-secondary">{t('settings.passcodeNote')}</div>
      </div>

      {mode === 'idle' && (
        <div className="flex flex-wrap items-center gap-2">
          {!enabled ? (
            <Button size="sm" onClick={() => setMode('set')}>
              {t('settings.passcodeSet')}
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={lock}>
                {t('settings.passcodeLockNow')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMode('change')}>
                {t('settings.passcodeChange')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMode('off')}>
                {t('settings.passcodeDisable')}
              </Button>
              <label className="flex items-center gap-2 text-sm text-fg-secondary">
                {t('settings.passcodeAutoLock')}
                <select
                  value={minutes}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setMinutes(value);
                    setAutoLockMinutes(userId, value);
                  }}
                  className="bg-bg-panel border border-border rounded-lg px-2 py-1 text-fg-primary"
                >
                  {AUTO_LOCK_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value === 60 ? '1 h' : `${value} min`}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}

      {mode !== 'idle' && (
        <form onSubmit={submit} className="space-y-2 max-w-xs">
          {(mode === 'change' || mode === 'off') && (
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              label={t('settings.passcodeCurrent')}
              value={current}
              onChange={(e) => setCurrent(digits(e.target.value))}
            />
          )}
          {mode !== 'off' && (
            <>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                label={t('settings.passcodeNew')}
                value={next}
                onChange={(e) => setNext(digits(e.target.value))}
              />
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                label={t('settings.passcodeRepeat')}
                value={repeat}
                onChange={(e) => setRepeat(digits(e.target.value))}
              />
            </>
          )}
          {error && (
            <div role="alert" className="text-sm text-fg-error">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={reset}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm">
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
