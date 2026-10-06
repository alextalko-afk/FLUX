import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { SettingsRow, Switch } from '../../../components/ui/Settings';
import { useI18n } from '../../../hooks/useI18n';

interface PrivacyFlags {
  showLastSeen: boolean;
  showOnlineStatus: boolean;
  showProfilePhoto: boolean;
  showBio: boolean;
  showPhoneNumber: boolean;
  showReadReceipts: boolean;
  showTypingStatus: boolean;
  allowCalls: boolean;
  allowGroupInvites: boolean;
  allowMessages: boolean;
  allowForwarding: boolean;
  allowSavingMedia: boolean;
  allowP2P: boolean;
  findByPhone: boolean;
}

type ToggleKey = keyof PrivacyFlags;

interface ToggleDef {
  key: ToggleKey;
  labelKey: string;
}

const VISIBILITY_TOGGLES: ToggleDef[] = [
  { key: 'showLastSeen', labelKey: 'settings.privacyLastSeen' },
  { key: 'showOnlineStatus', labelKey: 'settings.privacyOnline' },
  { key: 'showProfilePhoto', labelKey: 'settings.privacyPhoto' },
  { key: 'showBio', labelKey: 'settings.privacyBio' },
  { key: 'showPhoneNumber', labelKey: 'settings.privacyPhone' },
  { key: 'showReadReceipts', labelKey: 'settings.privacyReadReceipts' },
  { key: 'showTypingStatus', labelKey: 'settings.privacyTyping' },
];

const INTERACTION_TOGGLES: ToggleDef[] = [
  { key: 'allowMessages', labelKey: 'settings.privacyMessages' },
  { key: 'allowCalls', labelKey: 'settings.privacyCalls' },
  { key: 'allowGroupInvites', labelKey: 'settings.privacyGroups' },
  { key: 'findByPhone', labelKey: 'settings.privacyFindByPhone' },
  { key: 'allowForwarding', labelKey: 'settings.privacyForwarding' },
  { key: 'allowSavingMedia', labelKey: 'settings.privacySavingMedia' },
  { key: 'allowP2P', labelKey: 'settings.privacyP2P' },
];

/**
 * The 13 account privacy switches. Each toggle PATCHes a single field (the
 * server merges partial updates), and the server enforces every one of them —
 * hiding profile fields, suppressing presence/typing/read events and rejecting
 * calls, new dialogs, group invites and forwards.
 */
export function PrivacyPreferences() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ['privacy-settings'],
    queryFn: () => api.get<PrivacyFlags>('/users/me/privacy'),
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<Record<ToggleKey, boolean>>) =>
      api.patch('/users/me/privacy', patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-settings'] });
    },
    onError: () => toast.error(t('settings.privacySaveFailed')),
  });

  if (isLoading || !data) {
    return <div className="text-sm text-fg-secondary">{t('common.loading')}</div>;
  }

  const renderToggles = (toggles: ToggleDef[]) =>
    toggles.map((toggle) => {
      const label = t(toggle.labelKey);
      return (
        <SettingsRow key={toggle.key} title={label}>
          <Switch
            checked={Boolean(data[toggle.key])}
            onChange={(checked) => mutation.mutate({ [toggle.key]: checked })}
            label={label}
          />
        </SettingsRow>
      );
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-secondary">{t('settings.privacyHint')}</p>

      <h3 className="text-xs font-semibold text-fg-tertiary uppercase tracking-wide pt-1">
        {t('settings.privacyVisibility')}
      </h3>
      {renderToggles(VISIBILITY_TOGGLES)}

      <h3 className="text-xs font-semibold text-fg-tertiary uppercase tracking-wide pt-3">
        {t('settings.privacyInteractions')}
      </h3>
      {renderToggles(INTERACTION_TOGGLES)}
    </div>
  );
}
