import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { useI18n } from '../hooks/useI18n';

/** Opened from the QR code on a new device: shows which device asks and lets a signed-in user approve it. */
export function QrApprovePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useSearchParams()[0].get('token') ?? '';
  const [device, setDevice] = useState<{ userAgent: string; ip: string } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'expired' | 'done'>('loading');

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    api
      .post<{ userAgent: string; ip: string }>('/auth/qr/preview', { token })
      .then((d) => {
        setDevice(d);
        setState('ready');
      })
      .catch(() => setState('expired'));
  }, [isAuthenticated, token]);

  const approve = async () => {
    try {
      await api.post('/auth/qr/approve', { token });
      setState('done');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
    }
  };

  const box = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-bg-elevated border border-border rounded-panel shadow-panel p-6 space-y-4 text-center">{children}</div>
    </div>
  );

  if (!isAuthenticated) {
    return box(
      <>
        <h2 className="text-lg font-semibold text-fg-primary">{t('auth.qrApproveTitle')}</h2>
        <p className="text-sm text-fg-secondary">{t('auth.qrSignInFirst')}</p>
        <Link to="/login" className="text-fg-link hover:underline text-sm">
          {t('auth.login')}
        </Link>
      </>,
    );
  }

  return box(
    <>
      <h2 className="text-lg font-semibold text-fg-primary">{t('auth.qrApproveTitle')}</h2>
      {state === 'loading' && <p className="text-sm text-fg-secondary">{t('common.loading')}</p>}
      {state === 'expired' && <p className="text-sm text-fg-secondary">{t('auth.qrExpired')}</p>}
      {state === 'done' && <p className="text-sm text-green-600">{t('auth.qrApproved')}</p>}
      {state === 'ready' && device && (
        <>
          <p className="text-sm text-fg-secondary">{t('auth.qrApproveQuestion')}</p>
          <div className="text-xs text-fg-secondary break-words">
            <div>{device.userAgent || '—'}</div>
            <div>IP: {device.ip}</div>
          </div>
          <p className="text-xs text-fg-tertiary">{t('auth.qrApproveWarning')}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="ghost" onClick={() => navigate('/chats')}>
              {t('common.cancel')}
            </Button>
            <Button onClick={approve}>{t('auth.qrApprove')}</Button>
          </div>
        </>
      )}
      {(state === 'expired' || state === 'done') && (
        <Button variant="ghost" onClick={() => navigate('/chats')}>
          {t('auth.qrBack')}
        </Button>
      )}
    </>,
  );
}
