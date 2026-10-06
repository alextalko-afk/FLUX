import { useState, FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ApiError, api } from '../lib/api';
import { useI18n } from '../hooks/useI18n';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const { verifyEmail } = useAuthStore();
  const email = (location.state as any)?.email || '';
  const [devCode, setDevCode] = useState<string | undefined>(
    (location.state as any)?.devCode,
  );
  const [code, setCode] = useState(devCode || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleResend = async () => {
    if (!email || isResending) return;
    setIsResending(true);
    try {
      const result = await api.post<{ sent: boolean; devCode?: string }>(
        '/auth/email/resend',
        { email },
      );
      if (result.devCode) {
        setDevCode(result.devCode);
        setCode(result.devCode);
      }
      toast.success(t('auth.codeSent'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('auth.resendFailed'));
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await verifyEmail(email, code);
      toast.success(t('auth.emailVerified'));
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error(t('common.somethingWrong'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold text-fg-primary">{t('auth.verifyEmail')}</h2>
      <p className="text-sm text-fg-secondary">
        {t('auth.verifyDescription', { email })}
      </p>

      {devCode && (
        <div className="p-3 bg-bg-hover rounded-lg text-xs text-fg-secondary">
          {t('auth.devCode')}: <code className="font-mono">{devCode}</code>
        </div>
      )}

      <Input
        label={t('auth.verifyCode')}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        maxLength={6}
        placeholder="123456"
        autoComplete="one-time-code"
      />

      <Button type="submit" className="w-full" isLoading={isLoading}>
        {t('common.confirm')}
      </Button>

      <button
        type="button"
        className="w-full text-sm text-fg-link hover:underline disabled:opacity-50"
        onClick={handleResend}
        disabled={isResending || !email}
      >
        {isResending ? t('auth.sending') : t('auth.resendCode')}
      </button>
    </form>
  );
}
