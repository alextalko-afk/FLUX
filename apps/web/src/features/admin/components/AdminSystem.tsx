import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Switch } from '../../../components/ui/Settings';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';

interface Setting {
  key: string;
  type: 'boolean' | 'string' | 'number';
  value: boolean | string | number;
  description: string;
  isDefault: boolean;
}

interface QueueRow {
  name: string;
  counts: { waiting: number; active: number; delayed: number; completed: number; failed: number };
}

interface FailedJob {
  id: string;
  name: string;
  attemptsMade: number;
  failedReason: string;
  failedAt: string | null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function SettingRow({ setting, onSave }: { setting: Setting; onSave: (key: string, value: boolean | string | number) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(String(setting.value));
  const label = t(`admin.setting_${setting.key}`);

  if (setting.type === 'boolean') {
    return (
      <div className="bg-bg-elevated border border-border rounded-panel p-4">
        <Switch checked={Boolean(setting.value)} onChange={(v) => onSave(setting.key, v)} label={label} description={setting.description} />
      </div>
    );
  }

  const commit = () => {
    const value = setting.type === 'number' ? Number(draft) : draft;
    if (value !== setting.value) onSave(setting.key, value);
  };

  return (
    <div className="bg-bg-elevated border border-border rounded-panel p-4 space-y-2">
      <div>
        <div className="text-sm font-medium text-fg-primary">{label}</div>
        <div className="text-xs text-fg-secondary">{setting.description}</div>
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          type={setting.type === 'number' ? 'number' : 'text'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="flex-1 bg-bg-panel border border-border rounded-lg px-3 py-1.5 text-sm text-fg-primary"
        />
        <Button size="sm" onClick={commit}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function QueueCard({ queue }: { queue: QueueRow }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const failed = useQuery({
    queryKey: ['admin', 'queue-failed', queue.name],
    queryFn: () => api.get<{ items: FailedJob[] }>(`/admin/queues/${queue.name}/failed`),
    enabled: open && queue.counts.failed > 0,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'queues'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'queue-failed', queue.name] });
  };
  const act = useMutation({
    mutationFn: (action: 'retry-failed' | 'clean-failed') => api.post(`/admin/queues/${queue.name}/${action}`, {}),
    onSuccess: refresh,
    onError: (err) => toast.error(errorText(err, t('common.somethingWrong'))),
  });

  return (
    <div className="bg-bg-elevated border border-border rounded-panel p-4 space-y-2" data-testid={`queue-${queue.name}`}>
      <div className="flex items-center justify-between">
        <div className="font-medium text-fg-primary">{queue.name}</div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} disabled={queue.counts.failed === 0}>
            {t('admin.queueFailed')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act.mutate('retry-failed')} disabled={queue.counts.failed === 0}>
            {t('admin.queueRetry')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act.mutate('clean-failed')} disabled={queue.counts.failed === 0}>
            {t('admin.queueClean')}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 text-center text-sm">
        {(['waiting', 'active', 'delayed', 'completed', 'failed'] as const).map((state) => (
          <div key={state}>
            <div className={`text-lg font-semibold ${state === 'failed' && queue.counts.failed > 0 ? 'text-red-500' : 'text-fg-primary'}`}>{queue.counts[state]}</div>
            <div className="text-xs text-fg-secondary">{t(`admin.queue_${state}`)}</div>
          </div>
        ))}
      </div>
      {open && failed.data && (
        <ul className="text-xs space-y-1 pt-2 border-t border-border-subtle">
          {failed.data.items.map((job) => (
            <li key={job.id} className="text-fg-secondary break-words">
              <span className="text-fg-primary">{job.name}</span> · {job.attemptsMade}× · {job.failedReason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Runtime settings, maintenance mode and the state of the background queues. */
export function AdminSystem() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.get<{ items: Setting[] }>('/admin/settings') });
  const queues = useQuery({
    queryKey: ['admin', 'queues'],
    queryFn: () => api.get<{ items: QueueRow[] }>('/admin/queues'),
    refetchInterval: 10_000,
  });

  const save = useMutation({
    mutationFn: (patch: Record<string, boolean | string | number>) => api.patch<{ items: Setting[] }>('/admin/settings', patch),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'settings'], data);
      toast.success(t('admin.settingSaved'));
    },
    onError: (err) => toast.error(errorText(err, t('common.somethingWrong'))),
  });

  const maintenanceOn = settings.data?.items.find((s) => s.key === 'maintenanceMode')?.value === true;

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg-primary">{t('admin.system')}</h2>
        {maintenanceOn && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-fg-primary">{t('admin.maintenanceOn')}</div>
        )}
        {settings.data?.items.map((s) => (
          <SettingRow key={`${s.key}:${String(s.value)}`} setting={s} onSave={(key, value) => save.mutate({ [key]: value })} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg-primary">{t('admin.queues')}</h2>
        {queues.data?.items.map((q) => <QueueCard key={q.name} queue={q} />)}
      </section>
    </div>
  );
}
