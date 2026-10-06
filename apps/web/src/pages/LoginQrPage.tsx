import { useCallback, useEffect, useRef, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../hooks/useI18n';

interface QrCode {
  token: string;
  url: string;
  qr: string;
  expiresInSeconds: number;
}

const POLL_MS = 2000;

/** Sign in by showing a QR code that an already signed-in device approves. */
export function LoginQrPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const loginWithQr = useAuthStore((s) => s.loginWithQr);
  const [code, setCode] = useState<QrCode | null>(null);
  const [expired, setExpired] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);

  const create = useCallback(async () => {
    setExpired(false);
    setNeedsTotp(false);
    setTotp('');
    finishing.current = false;
    try {
      setCode(await api.post<QrCode>('/auth/qr', {}));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
    }
  }, [t]);

  useEffect(() => {
    void create();
  }, [create]);

  const finish = useCallback(
    async (token: string, secondFactor?: string) => {
      if (finishing.current && !secondFactor) return;
      finishing.current = true;
      setBusy(true);
      try {
        await loginWithQr(token, secondFactor);
        toast.success(t('auth.welcomeBack'));
        navigate('/chats');
      } catch (err) {
        if (err instanceof ApiError && err.code === '2FA_REQUIRED') {
          setNeedsTotp(true);
        } else if (err instanceof ApiError && err.code === 'QR_EXPIRED') {
          setExpired(true);
        } else {
          toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
          finishing.current = false;
        }
      } finally {
        setBusy(false);
      }
    },
    [loginWithQr, navigate, t],
  );

  // Poll until the other device approves; the server forgets the code after two minutes.
  useEffect(() => {
    if (!code || expired || needsTotp) return;
    const timer = setInterval(async () => {
      try {
        const res = await api.post<{ status: 'pending' | 'approved' | 'expired'; requiresTwoFactor?: boolean }>('/auth/qr/status', { token: code.token });
        if (res.status === 'expired') setExpired(true);
        else if (res.status === 'approved') {
          if (res.requiresTwoFactor) setNeedsTotp(true);
          else void finish(code.token);
        }
      } catch {
        // A failed poll is retried on the next tick.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [code, expired, needsTotp, finish]);

  const submitTotp = (e: FormEvent) => {
    e.preventDefault();
    if (code) void finish(code.token, totp);
  };

  return (
    <div className="space-y-4 text-center">
      <h2 className="text-xl font-semibold text-fg-primary">{t('auth.qrTitle')}</h2>
      <p className="text-sm text-fg-secondary">{t('auth.qrDescription')}</p>

      {needsTotp ? (
        <form onSubmit={submitTotp} className="space-y-3 text-left">
          <Input label={t('auth.totpOrRecoveryCode')} value={totp} onChange={(e) => setTotp(e.target.value)} required maxLength={16} autoComplete="one-time-code" />
          <Button type="submit" className="w-full" isLoading={busy}>
            {t('auth.login')}
          </Button>
        </form>
      ) : expired ? (
        <div className="space-y-3">
          <div className="text-sm text-fg-secondary">{t('auth.qrExpired')}</div>
          <Button onClick={() => void create()}>{t('auth.qrRefresh')}</Button>
        </div>
      ) : code ? (
        <div className="space-y-2">
          <img src={code.qr} alt={t('auth.qrTitle')} className="mx-auto w-56 h-56 rounded-lg bg-white p-2" data-testid="login-qr" />
          <div className="text-xs text-fg-tertiary">{t('auth.qrWaiting')}</div>
        </div>
      ) : (
        <div className="text-sm text-fg-secondary">{t('common.loading')}</div>
      )}

      <div className="text-sm text-fg-secondary">
        <Link to="/login" className="text-fg-link hover:underline">
          {t('auth.usePassword')}
        </Link>
      </div>
    </div>
  );
}
