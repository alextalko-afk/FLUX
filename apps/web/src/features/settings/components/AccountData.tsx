import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useI18n } from '../../../hooks/useI18n';

/**
 * "Your data": download everything the account owns, or delete the account.
 *
 * Deletion asks for the password again (and a 2FA code when enabled), so a
 * session left open on a shared computer cannot be used to erase the account.
 */
export function AccountData() {
  const { t } = useI18n();
  const { user, logout } = useAuthStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [deleteMessages, setDeleteMessages] = useState(false);
  const [error, setError] = useState('');

  const exportData = async () => {
    setIsExporting(true);
    try {
      const blob = await api.getBlob('/users/me/export');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flux-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.exportFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const closeDelete = () => {
    setIsDeleteOpen(false);
    setPassword('');
    setTotp('');
    setDeleteMessages(false);
    setError('');
  };

  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsDeleting(true);
    try {
      await api.delete('/users/me', {
        password,
        totp: user?.twoFactorEnabled ? totp.trim() : undefined,
        deleteMessages,
      });
      toast.success(t('settings.deleteAccountDone'));
      closeDelete();
      logout();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_CURRENT_PASSWORD') {
          setError(t('auth.currentPasswordWrong'));
        } else if (err.code === 'LAST_ADMIN') {
          setError(t('settings.deleteAccountLastAdmin'));
        } else {
          setError(err.message);
        }
      } else {
        setError(t('settings.deleteAccountFailed'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-fg-primary">{t('settings.yourData')}</h3>

      <div className="p-4 bg-bg-panel border border-border rounded-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-fg-secondary">{t('settings.exportDataHint')}</div>
          <Button variant="secondary" onClick={exportData} isLoading={isExporting}>
            {t('settings.exportData')}
          </Button>
        </div>
      </div>

      <div className="p-4 bg-bg-panel border border-border rounded-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-fg-secondary">{t('settings.deleteAccountHint')}</div>
          <Button variant="danger" onClick={() => setIsDeleteOpen(true)}>
            {t('settings.deleteAccount')}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={isDeleteOpen}
        onClose={closeDelete}
        title={t('settings.deleteAccount')}
        size="sm"
      >
        <form onSubmit={deleteAccount} className="p-5 space-y-4">
          <div className="text-sm font-medium text-fg-error">{t('settings.deleteAccountWarning')}</div>
          <div className="text-sm text-fg-secondary">{t('settings.deleteAccountHint')}</div>

          <Input
            label={t('settings.deleteAccountPassword')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            error={error || undefined}
          />

          {user?.twoFactorEnabled && (
            <Input
              label={t('auth.totpOrRecoveryCode')}
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              required
              maxLength={16}
              autoComplete="one-time-code"
            />
          )}

          <label className="flex items-center gap-2 text-sm text-fg-primary">
            <input
              type="checkbox"
              checked={deleteMessages}
              onChange={(e) => setDeleteMessages(e.target.checked)}
              className="h-4 w-4 accent-fg-accent"
            />
            {t('settings.deleteAccountMessages')}
          </label>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={closeDelete} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="danger" isLoading={isDeleting} className="flex-1">
              {t('settings.deleteAccountConfirm')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
