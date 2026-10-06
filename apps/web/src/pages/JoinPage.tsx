import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { useI18n } from '../hooks/useI18n';

interface InvitePreview {
  chatId: string | null;
  type: 'GROUP' | 'CHANNEL';
  title: string | null;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  alreadyMember: boolean;
}

/** Landing page of an invite link: shows the chat and asks to join. */
export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const { data, isLoading, error } = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => api.get<InvitePreview>(`/chats/invite/${encodeURIComponent(token)}`),
    retry: false,
  });

  const join = useMutation({
    mutationFn: () =>
      api.post<{ chatId: string | null; joined: boolean; pending?: boolean }>(`/chats/invite/${encodeURIComponent(token)}/join`),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      if (result.pending || !result.chatId) {
        toast.success(t('chatInfo.joinPending'));
        navigate('/chats', { replace: true });
        return;
      }
      navigate(`/chats/${result.chatId}`, { replace: true });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
    },
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-fg-secondary" role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h2 className="text-lg font-semibold text-fg-primary">{t('chatInfo.inviteInvalidTitle')}</h2>
        <p className="text-sm text-fg-secondary max-w-sm">{t('chatInfo.inviteInvalid')}</p>
        <Link to="/chats" className="text-fg-link hover:underline text-sm">
          {t('notFound.backToChats')}
        </Link>
      </div>
    );
  }

  const title = data.title || t('chats.group');

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-bg-elevated border border-border rounded-panel shadow-panel p-6 text-center space-y-4">
        <div className="flex justify-center">
          <Avatar name={title} avatarUrl={data.avatarUrl} size="lg" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-fg-primary break-words">{title}</h2>
          <div className="text-xs text-fg-secondary mt-1">
            {data.type === 'CHANNEL' ? t('chats.channel') : t('chats.group')} ·{' '}
            {t('chats.members', { count: data.memberCount })}
          </div>
        </div>
        {data.description && (
          <p className="text-sm text-fg-secondary whitespace-pre-wrap break-words">{data.description}</p>
        )}

        {data.alreadyMember && data.chatId ? (
          <Button className="w-full" onClick={() => navigate(`/chats/${data.chatId}`, { replace: true })}>
            {t('chatInfo.inviteOpen')}
          </Button>
        ) : (
          <Button className="w-full" onClick={() => join.mutate()} isLoading={join.isPending}>
            {data.type === 'CHANNEL' ? t('chatInfo.inviteSubscribe') : t('chatInfo.inviteJoin')}
          </Button>
        )}
      </div>
    </div>
  );
}
