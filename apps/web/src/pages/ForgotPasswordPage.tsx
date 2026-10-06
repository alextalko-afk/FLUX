import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ApiError, api } from '../lib/api';
import { useI18n } from '../hooks/useI18n';

/**
 * Two-step password reset: request a code by email, then exchange it for a new
 * password. Mirrors `VerifyEmailPage` (including the dev-only code hint) but
 * is reachable while signed out, from the login form.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await api.post<{ sent: boolean; devCode?: string }>(
        '/auth/password/forgot',
        { email },
      );
      if (result.devCode) {
        setDevCode(result.devCode);
        setCode(result.devCode);
      }
      toast.success(t('auth.resetCodeSent'));
      setStep('reset');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/auth/password/reset', { email, code, password });
      toast.success(t('auth.passwordResetDone'));
      navigate('/login');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'request') {
    return (
      <form onSubmit={requestCode} className="space-y-4">
        <h2 className="text-xl font-semibold text-fg-primary">{t('auth.forgotTitle')}</h2>
        <p className="text-sm text-fg-secondary">{t('auth.forgotDescription')}</p>

        <Input
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <Button type="submit" className="w-full" isLoading={isLoading}>
          {t('auth.sendResetCode')}
        </Button>

        <div className="text-sm text-center text-fg-secondary">
          <Link to="/login" className="text-fg-link hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={resetPassword} className="space-y-4">
      <h2 className="text-xl font-semibold text-fg-primary">{t('auth.resetTitle')}</h2>
      <p className="text-sm text-fg-secondary">
        {t('auth.resetDescription', { email })}
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

      <Input
        label={t('auth.newPassword')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
      />

      <Input
        label={t('auth.confirmPassword')}
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        autoComplete="new-password"
        error={error || undefined}
      />

      <Button type="submit" className="w-full" isLoading={isLoading}>
        {t('auth.resetPassword')}
      </Button>

      <div className="text-sm text-center text-fg-secondary">
        <Link to="/login" className="text-fg-link hover:underline">
          {t('auth.backToLogin')}
        </Link>
      </div>
    </form>
  );
}
