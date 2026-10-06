import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { api } from '../../../lib/api';
import { Skeleton } from '../../../components/ui/Skeleton';

interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  target: string | null;
  details: any;
  createdAt: string;
  admin: {
    id: string;
    username: string | null;
    firstName: string;
    lastName: string | null;
  };
}

export function AdminAuditLog() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => api.get<{ items: AuditLogEntry[]; nextCursor: string | null }>('/admin/audit?limit=100'),
  });

  const logs = data?.items || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-fg-primary">Audit log</h2>

      {logs.length === 0 ? (
        <div className="p-8 text-center text-sm text-fg-secondary bg-bg-panel border border-border rounded-lg">
          No audit logs yet
        </div>
      ) : (
        <div className="bg-bg-panel border border-border rounded-lg overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-bg-hover transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-bg-hover text-fg-secondary font-mono">
                        {log.action}
                      </span>
                      <span className="text-xs text-fg-tertiary">
                        {format(new Date(log.createdAt), 'PPp')}
                      </span>
                    </div>
                    <div className="text-sm text-fg-primary">
                      {log.admin.firstName} {log.admin.lastName || ''}
                      {log.admin.username && ` (@${log.admin.username})`}
                    </div>
                    {log.target && (
                      <div className="text-xs text-fg-secondary mt-1">
                        Target: <code className="font-mono">{log.target}</code>
                      </div>
                    )}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="text-xs text-fg-tertiary mt-1">
                        Details: {JSON.stringify(log.details)}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-fg-tertiary flex-shrink-0">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
