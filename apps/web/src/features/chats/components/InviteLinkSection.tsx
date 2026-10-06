import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../hooks/useI18n';

/** Invite link of a group or channel: show, copy, replace, switch off. */
export function InviteLinkSection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ['invite-link', chatId];

  const { data } = useQuery({
    queryKey,
    queryFn: () => api.get<{ token: string | null }>(`/chats/${chatId}/invite-link`),
  });

  const rotate = useMutation({
    mutationFn: () => api.post<{ token: string }>(`/chats/${chatId}/invite-link`),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    onError: () => toast.error(t('chatInfo.inviteFailed')),
  });

  const revoke = useMutation({
    mutationFn: () => api.delete<{ token: null }>(`/chats/${chatId}/invite-link`),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    onError: () => toast.error(t('chatInfo.inviteFailed')),
  });

  const token = data?.token ?? null;
  const url = token ? `${window.location.origin}/join/${token}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('chatInfo.inviteCopied'));
    } catch {
      toast.error(t('common.somethingWrong'));
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg-primary uppercase tracking-wide px-1">
        {t('chatInfo.inviteLink')}
      </h3>
      <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4 space-y-3">
        {token ? (
          <>
            <input
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              aria-label={t('chatInfo.inviteLink')}
              className="w-full px-3 py-2 rounded-lg bg-bg-hover text-sm text-fg-primary font-mono truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copy}>
                {t('chatInfo.inviteCopy')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => rotate.mutate()}
                isLoading={rotate.isPending}
              >
                {t('chatInfo.inviteReset')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => revoke.mutate()}
                isLoading={revoke.isPending}
              >
                {t('chatInfo.inviteRevoke')}
              </Button>
            </div>
            <p className="text-xs text-fg-secondary">{t('chatInfo.inviteHint')}</p>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-fg-secondary">{t('chatInfo.inviteNone')}</p>
            <Button size="sm" onClick={() => rotate.mutate()} isLoading={rotate.isPending}>
              {t('chatInfo.inviteCreate')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
