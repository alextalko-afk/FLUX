import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { useDebounce } from '../../../hooks/useDebounce';
import { useI18n } from '../../../hooks/useI18n';

interface BlockedEntry {
  blockedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
  };
}

export function Privacy() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data: blocked, isLoading } = useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => api.get<{ items: BlockedEntry[] }>('/users/blocked'),
  });

  const { data: searchResult, isFetching } = useQuery({
    queryKey: ['user-search', debouncedQuery],
    queryFn: () =>
      api.get<{ items: any[] }>(
        `/users/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`,
      ),
    enabled: debouncedQuery.trim().length >= 2,
  });

  const blockMutation = useMutation({
    mutationFn: (targetId: string) => api.post(`/users/${targetId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      queryClient.invalidateQueries({ queryKey: ['user-search', debouncedQuery] });
      toast.success(t('settings.blocked'));
    },
    onError: () => toast.error(t('settings.blockFailed')),
  });

  const unblockMutation = useMutation({
    mutationFn: (targetId: string) => api.delete(`/users/${targetId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      toast.success(t('settings.unblocked'));
    },
    onError: () => toast.error(t('settings.unblockFailed')),
  });

  const blockedIds = new Set((blocked?.items || []).map((b) => b.user.id));
  const blockedUsers = blocked?.items || [];
  const candidates = (searchResult?.items || []).filter((u) => !blockedIds.has(u.id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-fg-primary mb-1">{t('settings.privacy')}</h2>
        <p className="text-sm text-fg-secondary mb-4">
          {t('settings.blockedDescription')}
        </p>

        <Input
          placeholder={t('settings.blockSearchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {debouncedQuery.trim().length >= 2 && isFetching && (
          <div className="mt-3 text-sm text-fg-secondary">{t('settings.searching')}</div>
        )}

        {candidates.length > 0 && (
          <div className="mt-3 space-y-1">
            {candidates.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-hover"
              >
                <div className="w-9 h-9 rounded-full bg-fg-accent flex items-center justify-center text-fg-on-accent text-sm font-semibold flex-shrink-0">
                  {user.firstName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fg-primary truncate">
                    {user.firstName} {user.lastName || ''}
                  </div>
                  {user.username && (
                    <div className="text-xs text-fg-secondary truncate">@{user.username}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => blockMutation.mutate(user.id)}
                  isLoading={blockMutation.isPending}
                >
                  {t('settings.block')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-fg-primary mb-2">{t('settings.blockedUsers')}</h3>
        {isLoading ? (
          <div className="text-sm text-fg-secondary">{t('common.loading')}</div>
        ) : blockedUsers.length === 0 ? (
          <div className="text-sm text-fg-secondary">{t('settings.noneBlocked')}</div>
        ) : (
          <div className="space-y-1">
            {blockedUsers.map((entry) => (
              <div
                key={entry.user.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-hover"
              >
                <div className="w-9 h-9 rounded-full bg-bg-hover border border-border flex items-center justify-center text-fg-secondary text-sm font-semibold flex-shrink-0">
                  {entry.user.firstName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fg-primary truncate">
                    {entry.user.firstName} {entry.user.lastName || ''}
                  </div>
                  {entry.user.username && (
                    <div className="text-xs text-fg-secondary truncate">@{entry.user.username}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => unblockMutation.mutate(entry.user.id)}
                  isLoading={unblockMutation.isPending}
                >
                  {t('settings.unblock')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
