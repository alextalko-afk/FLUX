import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ApiError } from '../lib/api';
import { useI18n } from '../hooks/useI18n';

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { register, isLoading } = useAuthStore();
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    username: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (form.password.length < 8) {
      setErrors({ password: t('auth.passwordShort') });
      return;
    }

    try {
      const result = await register(form);
      toast.success(t('auth.accountCreated'));
      navigate('/verify', { state: { email: form.email, devCode: result.devCode } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_ALREADY_USED') {
          setErrors({ email: t('auth.emailTaken') });
          return;
        }
        if (err.code === 'USERNAME_ALREADY_TAKEN') {
          setErrors({ username: t('auth.usernameTaken') });
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
      <h2 className="text-xl font-semibold text-fg-primary">{t('auth.registerTitle')}</h2>

      <Input
        label={t('auth.email')}
        type="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
        autoComplete="email"
        error={errors.email}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('auth.firstName')}
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          required
        />
        <Input
          label={t('auth.lastName')}
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
        />
      </div>

      <Input
        label={t('auth.username')}
        value={form.username}
        onChange={(e) => setForm({ ...form, username: e.target.value })}
        hint={t('auth.usernameHint')}
        error={errors.username}
      />

      <Input
        label={t('auth.password')}
        type="password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        required
        autoComplete="new-password"
        hint={t('auth.passwordHint')}
        error={errors.password}
      />

      <Button type="submit" className="w-full" isLoading={isLoading}>
        {t('auth.register')}
      </Button>

      <div className="text-sm text-center text-fg-secondary">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" className="text-fg-link hover:underline">
          {t('auth.login')}
        </Link>
      </div>
    </form>
  );
}
