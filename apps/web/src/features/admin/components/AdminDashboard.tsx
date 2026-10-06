import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Skeleton } from '../../../components/ui/Skeleton';

interface DashboardData {
  users: { total: number; active24h: number };
  chats: number;
  messages: { total: number; last7Days: { date: string; count: number }[] };
  files: number;
  reports: { pending: number };
  bots: number;
  calls: number;
}

export function AdminDashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get<DashboardData>('/admin/dashboard'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 bg-fg-error/10 border border-fg-error rounded-lg text-sm text-fg-error">
        Failed to load dashboard data
      </div>
    );
  }

  const maxMessages = Math.max(...data.messages.last7Days.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-fg-primary mb-4">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total users" value={data.users.total} />
          <StatCard label="Active (24h)" value={data.users.active24h} />
          <StatCard label="Chats" value={data.chats} />
          <StatCard label="Messages" value={data.messages.total} />
          <StatCard label="Files" value={data.files} />
          <StatCard label="Pending reports" value={data.reports.pending} accent={data.reports.pending > 0} />
          <StatCard label="Bots" value={data.bots} />
          <StatCard label="Calls" value={data.calls} />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-fg-primary mb-3">Messages (last 7 days)</h3>
        <div className="bg-bg-panel border border-border rounded-lg p-4">
          <div className="flex items-end gap-2 h-48">
            {data.messages.last7Days.map((day) => {
              const height = (day.count / maxMessages) * 100;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-fg-secondary">{day.count}</div>
                  <div
                    className="w-full bg-fg-accent rounded-t transition-all hover:opacity-80"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${day.date}: ${day.count} messages`}
                  />
                  <div className="text-2xs text-fg-tertiary">
                    {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-bg-panel border border-border rounded-lg p-4">
      <div className="text-xs text-fg-secondary mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? 'text-fg-error' : 'text-fg-primary'}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
