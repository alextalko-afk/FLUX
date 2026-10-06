import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { SettingsRow, Switch } from '../../../components/ui/Settings';
import { useI18n } from '../../../hooks/useI18n';
import { enablePushNotifications, pushSupported } from '../../../lib/push';

interface NotificationPreferences {
  enabled: boolean;
  showPreview: boolean;
  soundEnabled: boolean;
  privateChats: boolean;
  groupChats: boolean;
  channels: boolean;
  mentions: boolean;
  subscriptionsCount: number;
}

type ToggleKey = Exclude<keyof NotificationPreferences, 'subscriptionsCount'>;

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [enablingPush, setEnablingPush] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api.get<NotificationPreferences>('/notifications/settings'),
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<Record<ToggleKey, boolean>>) =>
      api.post('/notifications/settings', patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
    onError: () => toast.error(t('settings.notificationSaveFailed')),
  });

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      const enabled = await enablePushNotifications();
      if (enabled) {
        toast.success(t('settings.pushEnabled'));
        queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      } else {
        toast.error(t('settings.pushFailed'));
      }
    } catch {
      toast.error(t('settings.pushFailed'));
    } finally {
      setEnablingPush(false);
    }
  };

  if (isLoading || !data) {
    return <div className="text-sm text-fg-secondary">{t('common.loading')}</div>;
  }

  const toggles: { key: ToggleKey; label: string }[] = [
    { key: 'enabled', label: t('settings.notifyEnabled') },
    { key: 'showPreview', label: t('settings.notifyPreview') },
    { key: 'soundEnabled', label: t('settings.notifySound') },
    { key: 'privateChats', label: t('settings.notifyPrivate') },
    { key: 'groupChats', label: t('settings.notifyGroups') },
    { key: 'channels', label: t('settings.notifyChannels') },
    { key: 'mentions', label: t('settings.notifyMentions') },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-secondary">{t('settings.notificationsHint')}</p>

      {toggles.map((toggle) => (
        <SettingsRow key={toggle.key} title={toggle.label}>
          <Switch
            checked={Boolean(data[toggle.key])}
            onChange={(checked) => mutation.mutate({ [toggle.key]: checked })}
            ariaLabel={toggle.label}
          />
        </SettingsRow>
      ))}

      {pushSupported() && (
        <div className="pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={enablingPush}
            onClick={handleEnablePush}
          >
            {data.subscriptionsCount > 0
              ? t('settings.pushAlreadyEnabled')
              : t('settings.enablePush')}
          </Button>
        </div>
      )}
    </div>
  );
}
