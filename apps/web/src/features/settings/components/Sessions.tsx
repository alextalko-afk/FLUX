import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useI18n } from '../../../hooks/useI18n';
import { formatRelative } from '../../../lib/format';

interface Session {
  id: string;
  userAgent: string;
  ip: string;
  isActive: boolean;
  isCurrent: boolean;
  createdAt: string;
  lastActiveAt: string;
  deviceInfo?: {
    platform: string;
    browser: string;
    os: string;
    device: string;
  };
}

export function Sessions() {
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<{ items: Session[] }>('/users/me/sessions'),
  });

  const terminateMutation = useMutation({
    mutationFn: (sessionId: string) => api.post(`/users/me/sessions/${sessionId}/terminate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(t('settings.terminated'));
    },
    onError: () => {
      toast.error(t('settings.terminateFailed'));
    },
  });

  const terminateAllMutation = useMutation({
    mutationFn: () => api.post('/users/me/sessions/terminate-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(t('settings.terminatedAll'));
    },
    onError: () => {
      toast.error(t('settings.terminateFailed'));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const sessions = data?.items || [];
  const currentSession = sessions.find((s) => s.isCurrent);
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-fg-primary">{t('settings.sessions')}</h3>
        {otherSessions.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => terminateAllMutation.mutate()}
            isLoading={terminateAllMutation.isPending}
          >
            {t('settings.terminateAll')}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {currentSession && (
          <div className="p-3 bg-bg-panel border border-border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg-primary">
                    {currentSession.deviceInfo?.browser || t('settings.unknownBrowser')}
                  </span>
                  <span className="text-xs bg-fg-success text-fg-inverse px-2 py-0.5 rounded-full">
                    {t('settings.current')}
                  </span>
                </div>
                <div className="text-xs text-fg-secondary mt-1">
                  {currentSession.deviceInfo?.os || t('settings.unknownOs')} •{' '}
                  {currentSession.ip}
                </div>
                <div className="text-xs text-fg-tertiary mt-0.5">
                  {t('settings.lastActive', {
                    value: formatRelative(new Date(currentSession.lastActiveAt), locale),
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {otherSessions.map((session) => (
          <div key={session.id} className="p-3 bg-bg-panel border border-border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-fg-primary">
                  {session.deviceInfo?.browser || t('settings.unknownBrowser')}
                </div>
                <div className="text-xs text-fg-secondary mt-1">
                  {session.deviceInfo?.os || t('settings.unknownOs')} • {session.ip}
                </div>
                <div className="text-xs text-fg-tertiary mt-0.5">
                  {t('settings.created', {
                    value: formatRelative(new Date(session.createdAt), locale),
                  })}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => terminateMutation.mutate(session.id)}
                isLoading={terminateMutation.isPending}
              >
                {t('settings.terminate')}
              </Button>
            </div>
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="text-center text-sm text-fg-secondary py-8">
            {t('settings.noSessions')}
          </div>
        )}
      </div>
    </div>
  );
}
