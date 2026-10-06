import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useI18n } from '../../../hooks/useI18n';

export function ChangePassword() {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (newPassword.length < 8) {
      setErrors({ newPassword: t('auth.passwordShort') });
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: t('auth.passwordMismatch') });
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/users/me/password', {
        currentPassword,
        newPassword,
      });
      toast.success(t('auth.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_CURRENT_PASSWORD') {
          setErrors({ currentPassword: t('auth.currentPasswordWrong') });
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error(t('auth.changePasswordFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold text-fg-primary">{t('settings.changePassword')}</h3>
      <Input
        label={t('auth.currentPassword')}
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        required
        autoComplete="current-password"
        error={errors.currentPassword}
      />
      <Input
        label={t('auth.newPassword')}
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
        autoComplete="new-password"
        hint={t('settings.atLeast8')}
        error={errors.newPassword}
      />
      <Input
        label={t('auth.confirmPassword')}
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        autoComplete="new-password"
        error={errors.confirmPassword}
      />
      <Button type="submit" isLoading={isLoading}>
        {t('settings.changePassword')}
      </Button>
    </form>
  );
}
