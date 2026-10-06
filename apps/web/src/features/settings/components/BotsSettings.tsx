import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useI18n } from '../../../hooks/useI18n';

interface MyBot {
  id: string;
  name: string;
  username: string;
  description: string | null;
  isPublic?: boolean;
}
interface CatalogBot {
  id: string;
  name: string;
  username: string;
  description: string | null;
}

const card = 'bg-bg-elevated border border-border rounded-panel shadow-panel p-4';

export function BotsSettings() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const mine = useQuery({ queryKey: ['bots', 'mine'], queryFn: () => api.get<{ items: MyBot[] }>('/bots') });
  const catalog = useQuery({
    queryKey: ['bots', 'catalog', q],
    queryFn: () => api.get<{ items: CatalogBot[] }>(`/bots/catalog?q=${encodeURIComponent(q)}`),
  });

  const fail = (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bots'] });

  const create = useMutation({
    mutationFn: () => api.post<{ token: string }>('/bots', { name, username }),
    onSuccess: (res) => {
      setToken(res.token);
      setName('');
      setUsername('');
      void refresh();
    },
    onError: fail,
  });
  const publish = useMutation({
    mutationFn: (b: MyBot) => api.patch(`/bots/${b.id}`, { isPublic: !b.isPublic }),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/bots/${id}`), onSuccess: refresh, onError: fail });

  return (
    <div className="space-y-4" data-testid="bots-settings">
      <div className={card}>
        <h3 className="font-semibold text-fg-primary mb-1">{t('bots.create')}</h3>
        <p className="text-xs text-fg-secondary mb-3">{t('bots.hint')}</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Input label={t('bots.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <Input label={t('bots.username')} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => create.mutate()} isLoading={create.isPending} disabled={name.length < 3 || username.length < 3}>
          {t('bots.createButton')}
        </Button>
        {token && (
          <div className="mt-3 p-3 rounded-xl bg-bg-hover text-xs break-all">
            <div className="font-medium text-fg-primary mb-1">{t('bots.tokenOnce')}</div>
            <code>{token}</code>
          </div>
        )}
      </div>

      {(mine.data?.items.length ?? 0) > 0 && (
        <div className={card}>
          <h3 className="font-semibold text-fg-primary mb-2">{t('bots.mine')}</h3>
          {mine.data!.items.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-fg-primary truncate">{b.name}</div>
                <div className="text-xs text-fg-secondary">@{b.username}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => publish.mutate(b)}>
                {b.isPublic ? t('bots.unpublish') : t('bots.publish')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(b.id)}>
                {t('common.delete')}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className={card}>
        <h3 className="font-semibold text-fg-primary mb-2">{t('bots.catalog')}</h3>
        <Input label={t('bots.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2">
          {catalog.data?.items.length === 0 && <div className="text-sm text-fg-secondary">{t('bots.empty')}</div>}
          {catalog.data?.items.map((b) => (
            <div key={b.id} className="py-1.5">
              <div className="text-sm text-fg-primary">
                {b.name} <span className="text-xs text-fg-secondary">@{b.username}</span>
              </div>
              {b.description && <div className="text-xs text-fg-secondary">{b.description}</div>}
            </div>
          ))}
        </div>
        <p className="text-xs text-fg-tertiary mt-2">{t('bots.useHint')}</p>
      </div>
    </div>
  );
}
