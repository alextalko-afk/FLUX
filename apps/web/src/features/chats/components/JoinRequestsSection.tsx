import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Switch } from '../../../components/ui/Settings';
import { useI18n } from '../../../hooks/useI18n';
import { api } from '../../../lib/api';

interface Request {
  userId: string;
  user: { firstName?: string | null; lastName?: string | null; username?: string | null; avatarUrl?: string | null };
}

const nameOf = (u: Request['user']) =>
  `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username || '—';

/** Approval switch for the invite link, and the people waiting to be let in. */
export function JoinRequestsSection({ chatId, approval }: { chatId: string; approval: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(approval);
  const key = ['join-requests', chatId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ items: Request[] }>(`/chats/${chatId}/join-requests`),
  });

  const toggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await api.patch(`/chats/${chatId}`, { joinApproval: next });
    } catch {
      setEnabled(!next);
      toast.error(t('common.somethingWrong'));
    }
  };

  const decide = useMutation({
    mutationFn: ({ userId, approve }: { userId: string; approve: boolean }) =>
      approve
        ? api.post(`/chats/${chatId}/join-requests/${userId}/approve`)
        : api.delete(`/chats/${chatId}/join-requests/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: () => toast.error(t('common.somethingWrong')),
  });

  const items = data?.items ?? [];

  return (
    <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4 space-y-3">
      <Switch checked={enabled} onChange={(next) => void toggle(next)} label={t('chatInfo.approveNew')} />
      {items.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-border-subtle">
          <div className="text-xs uppercase text-fg-tertiary">{t('chatInfo.joinRequests')}</div>
          {items.map((request) => (
            <div key={request.userId} className="flex items-center gap-3">
              <Avatar name={nameOf(request.user)} avatarUrl={request.user.avatarUrl} size="sm" />
              <div className="flex-1 min-w-0 text-sm text-fg-primary truncate">{nameOf(request.user)}</div>
              <Button size="sm" onClick={() => decide.mutate({ userId: request.userId, approve: true })}>
                {t('chatInfo.joinApprove')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => decide.mutate({ userId: request.userId, approve: false })}
              >
                {t('chatInfo.joinReject')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
