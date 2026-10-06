import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useI18n } from '../../../hooks/useI18n';

/** Recovery codes are shown once; this lets the owner keep them offline. */
function RecoveryCodesModal({ codes, onClose }: { codes: string[] | null; onClose: () => void }) {
  const { t } = useI18n();

  const copyAll = async () => {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      toast.success(t('settings.recoveryCodesCopied'));
    } catch {
      toast.error(t('common.somethingWrong'));
    }
  };

  const download = () => {
    if (!codes) return;
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'flux-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={codes !== null}
      onClose={onClose}
      title={t('settings.recoveryCodesSaveTitle')}
      size="md"
    >
      <div className="p-5 space-y-4">
        <div className="text-sm text-fg-secondary">{t('settings.recoveryCodesSaveHint')}</div>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-fg-primary" aria-label={t('settings.recoveryCodes')}>
          {codes?.map((value) => (
            <li key={value} className="px-3 py-2 rounded-lg bg-bg-hover text-center select-all">
              {value}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={copyAll} className="flex-1">
            {t('settings.recoveryCodesCopy')}
          </Button>
          <Button variant="secondary" onClick={download} className="flex-1">
            {t('settings.recoveryCodesDownload')}
          </Button>
        </div>
        <Button onClick={onClose} className="w-full">
          {t('settings.recoveryCodesSaved')}
        </Button>
      </div>
    </Modal>
  );
}

export function TwoFactor() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { user, refreshUser } = useAuthStore();
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);
  const [setupData, setSetupData] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const reportError = (err: unknown) => {
    toast.error(err instanceof ApiError ? err.message : t('settings.invalidCode'));
  };

  const closeDialogs = () => {
    setIsSetupOpen(false);
    setIsDisableOpen(false);
    setIsRegenerateOpen(false);
    setSetupData(null);
    setCode('');
  };

  const setupMutation = useMutation({
    mutationFn: () => api.post<{ qrCodeDataUrl: string; secret: string }>('/auth/2fa/setup'),
    onSuccess: (data) => {
      setSetupData(data);
      setIsSetupOpen(true);
    },
    onError: () => {
      toast.error(t('settings.setupFailed'));
    },
  });

  const enableMutation = useMutation({
    mutationFn: (value: string) =>
      api.post<{ enabled: boolean; backupCodes: string[] }>('/auth/2fa/enable', { code: value }),
    onSuccess: async (result) => {
      toast.success(t('settings.enabledToast'));
      closeDialogs();
      setRecoveryCodes(result.backupCodes);
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: reportError,
  });

  const disableMutation = useMutation({
    mutationFn: (value: string) => api.post('/auth/2fa/disable', { code: value }),
    onSuccess: async () => {
      toast.success(t('settings.disabledToast'));
      closeDialogs();
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: reportError,
  });

  const regenerateMutation = useMutation({
    mutationFn: (value: string) =>
      api.post<{ backupCodes: string[] }>('/auth/2fa/backup-codes/regenerate', { code: value }),
    onSuccess: async (result) => {
      toast.success(t('settings.recoveryCodesRegenerated'));
      closeDialogs();
      setRecoveryCodes(result.backupCodes);
      await refreshUser();
    },
    onError: reportError,
  });

  // Enabling and regenerating need the 6-digit authenticator code; disabling
  // also accepts a recovery code, so only a minimum length is enforced there.
  const requireTotp = (action: (value: string) => void) => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error(t('settings.codeMustBe6'));
      return;
    }
    action(code.trim());
  };

  const handleDisable = () => {
    if (code.trim().length < 6) {
      toast.error(t('settings.codeMustBe6'));
      return;
    }
    disableMutation.mutate(code.trim());
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-fg-primary">{t('settings.twoFactor')}</h3>
      <div className="p-4 bg-bg-panel border border-border rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-fg-primary">
              {t('settings.twoFactorStatus', {
                status: user?.twoFactorEnabled ? t('settings.enabled') : t('settings.disabled'),
              })}
            </div>
            <div className="text-xs text-fg-secondary mt-1">
              {user?.twoFactorEnabled ? t('settings.twoFactorOn') : t('settings.twoFactorOff')}
            </div>
          </div>
          <Button
            variant={user?.twoFactorEnabled ? 'secondary' : 'primary'}
            onClick={() => {
              if (user?.twoFactorEnabled) {
                setIsDisableOpen(true);
              } else {
                setupMutation.mutate();
              }
            }}
            isLoading={setupMutation.isPending}
          >
            {user?.twoFactorEnabled ? t('settings.disable') : t('settings.enable')}
          </Button>
        </div>
      </div>

      {user?.twoFactorEnabled && (
        <div className="p-4 bg-bg-panel border border-border rounded-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-fg-primary">{t('settings.recoveryCodes')}</div>
              <div className="text-xs text-fg-secondary mt-1">{t('settings.recoveryCodesHint')}</div>
              <div className="text-xs text-fg-tertiary mt-1">
                {t('settings.recoveryCodesLeft', { count: user.twoFactorBackupCodesRemaining ?? 0 })}
              </div>
            </div>
            <Button variant="secondary" onClick={() => setIsRegenerateOpen(true)}>
              {t('settings.recoveryCodesRegenerate')}
            </Button>
          </div>
        </div>
      )}

      <Modal isOpen={isSetupOpen} onClose={closeDialogs} title={t('settings.enable2fa')} size="md">
        <div className="p-5 space-y-4">
          {setupData && (
            <>
              <div className="text-sm text-fg-secondary">{t('settings.scanQr')}</div>
              <div className="flex justify-center">
                <img src={setupData.qrCodeDataUrl} alt="2FA QR Code" className="w-48 h-48" />
              </div>
              <div className="text-xs text-fg-tertiary text-center">
                {t('settings.orEnterManually')}{' '}
                <code className="font-mono">{setupData.secret}</code>
              </div>
              <Input
                label={t('auth.verifyCode')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={closeDialogs} className="flex-1">
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => requireTotp(enableMutation.mutate)}
                  isLoading={enableMutation.isPending}
                  className="flex-1"
                >
                  {t('settings.enable')}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={isDisableOpen} onClose={closeDialogs} title={t('settings.disable2fa')} size="sm">
        <div className="p-5 space-y-4">
          <div className="text-sm text-fg-secondary">{t('settings.enterCodeToDisable')}</div>
          <Input
            label={t('auth.totpOrRecoveryCode')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            maxLength={16}
            autoComplete="one-time-code"
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={closeDialogs} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleDisable}
              isLoading={disableMutation.isPending}
              className="flex-1"
            >
              {t('settings.disable')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isRegenerateOpen}
        onClose={closeDialogs}
        title={t('settings.recoveryCodesRegenerate')}
        size="sm"
      >
        <div className="p-5 space-y-4">
          <div className="text-sm text-fg-secondary">{t('settings.recoveryCodesRegenerateHint')}</div>
          <Input
            label={t('auth.verifyCode')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={closeDialogs} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => requireTotp(regenerateMutation.mutate)}
              isLoading={regenerateMutation.isPending}
              className="flex-1"
            >
              {t('settings.recoveryCodesRegenerate')}
            </Button>
          </div>
        </div>
      </Modal>

      <RecoveryCodesModal codes={recoveryCodes} onClose={() => setRecoveryCodes(null)} />
    </div>
  );
}
