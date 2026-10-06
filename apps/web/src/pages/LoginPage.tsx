import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ApiError } from '../lib/api';
import { useI18n } from '../hooks/useI18n';

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      await login(email, password, needsTotp ? totp : undefined);
      toast.success(t('auth.welcomeBack'));
      navigate('/chats');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === '2FA_REQUIRED') {
          setNeedsTotp(true);
          return;
        }
        if (err.code === 'INVALID_CREDENTIALS') {
          setErrors({ password: t('auth.invalidCredentials') });
          return;
        }
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          navigate('/verify', { state: { email } });
          return;
        }
        toast.error(err.message);
      } else {
        toast.error(t('common.somethingWrong'));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold text-fg-primary">{t('auth.loginTitle')}</h2>

      <Input
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        error={errors.email}
      />

      <Input
        label={t('auth.password')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        error={errors.password}
      />

      {needsTotp && (
        <Input
          label={t('auth.totpOrRecoveryCode')}
          type="text"
          value={totp}
          onChange={(e) => setTotp(e.target.value)}
          required
          maxLength={16}
          autoComplete="one-time-code"
        />
      )}

      <Button type="submit" className="w-full" isLoading={isLoading}>
        {t('auth.login')}
      </Button>

      <div className="text-sm text-center">
        <Link to="/login/qr" className="text-fg-link hover:underline">
          {t('auth.loginWithQr')}
        </Link>
      </div>

      <div className="text-sm text-center">
        <Link to="/forgot-password" className="text-fg-link hover:underline">
          {t('auth.forgotPassword')}
        </Link>
      </div>

      <div className="text-sm text-center text-fg-secondary">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="text-fg-link hover:underline">
          {t('auth.register')}
        </Link>
      </div>
    </form>
  );
}
