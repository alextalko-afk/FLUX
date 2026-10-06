import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';

interface Bot {
  id: string;
  name: string;
  username: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  owner: {
    id: string;
    username: string | null;
    firstName: string;
    lastName: string | null;
  };
}

export function AdminBots() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'bots'],
    queryFn: () => api.get<{ items: Bot[]; nextCursor: string | null }>('/bots/admin/all?limit=100'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ botId, isActive }: { botId: string; isActive: boolean }) =>
      api.post(`/bots/admin/${botId}/toggle`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'bots'] });
      toast.success('Bot status updated');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to update bot');
      }
    },
  });

  const bots = data?.items || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-fg-primary">Bots</h2>
        <div className="text-sm text-fg-secondary">
          {bots.length} bots total
        </div>
      </div>

      {bots.length === 0 ? (
        <div className="p-8 text-center text-sm text-fg-secondary bg-bg-panel border border-border rounded-lg">
          No bots created yet
        </div>
      ) : (
        <div className="space-y-2">
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="bg-bg-panel border border-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-medium text-fg-primary">{bot.name}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      bot.isActive
                        ? 'bg-fg-success/10 text-fg-success'
                        : 'bg-fg-error/10 text-fg-error'
                    }`}>
                      {bot.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-sm text-fg-secondary mb-1">@{bot.username}</div>
                  {bot.description && (
                    <div className="text-sm text-fg-tertiary mb-2">{bot.description}</div>
                  )}
                  <div className="text-xs text-fg-tertiary">
                    Owner: {bot.owner.firstName} {bot.owner.lastName || ''}
                    {bot.owner.username && ` (@${bot.owner.username})`}
                    {' • '}
                    Created {formatDistanceToNow(new Date(bot.createdAt), { addSuffix: true })}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={bot.isActive ? 'secondary' : 'primary'}
                  onClick={() =>
                    toggleMutation.mutate({ botId: bot.id, isActive: !bot.isActive })
                  }
                  isLoading={toggleMutation.isPending}
                >
                  {bot.isActive ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
