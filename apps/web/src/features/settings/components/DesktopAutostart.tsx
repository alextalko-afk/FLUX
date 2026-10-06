import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Switch } from '../../../components/ui/Settings';
import { useI18n } from '../../../hooks/useI18n';

/** "Start FLUX when I sign in to the computer", only inside the desktop app. */
export function DesktopAutostart() {
  const { t } = useI18n();
  const api = window.electronAPI;
  const [state, setState] = useState<{ supported: boolean; enabled: boolean } | null>(null);

  useEffect(() => {
    api?.getAutostart().then(setState).catch(() => setState(null));
  }, [api]);

  if (!api || !state?.supported) return null;

  const change = async (enabled: boolean) => {
    try {
      setState(await api.setAutostart(enabled));
    } catch {
      toast.error(t('common.somethingWrong'));
    }
  };

  return (
    <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4">
      <Switch checked={state.enabled} onChange={(v) => void change(v)} label={t('settings.autostart')} description={t('settings.autostartHint')} />
    </div>
  );
}
