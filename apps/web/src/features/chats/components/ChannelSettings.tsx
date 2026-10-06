import toast from 'react-hot-toast';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../../hooks/useI18n';
import { api } from '../../../lib/api';

/** Lets subscribers comment under channel posts. */
export function CommentsToggle({ chatId, current }: { chatId: string; current: boolean }) {
  const { t } = useI18n();
  const [value, setValue] = useState(current);

  const change = async (next: boolean) => {
    setValue(next);
    try {
      await api.patch(`/chats/${chatId}`, { commentsEnabled: next });
    } catch {
      setValue(!next);
      toast.error(t('common.somethingWrong'));
    }
  };

  return (
    <label className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4 flex items-center justify-between gap-3 text-sm text-fg-primary">
      {t('channel.comments')}
      <input type="checkbox" checked={value} onChange={(e) => void change(e.target.checked)} />
    </label>
  );
}

interface Stats {
  subscribers: number;
  posts: number;
  avgViews: number;
  joinsByDay: { date: string; count: number }[];
  topPosts: { id: string; preview: string; views: number; comments: number }[];
}

/** Subscribers, views and joins of the last two weeks, for channel admins. */
export function StatsSection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ['channel-stats', chatId], queryFn: () => api.get<Stats>(`/chats/${chatId}/stats`) });
  if (!data) return null;
  const max = Math.max(1, ...data.joinsByDay.map((d) => d.count));

  return (
    <section className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4 space-y-3" data-testid="channel-stats">
      <h3 className="text-sm font-semibold text-fg-primary uppercase tracking-wide">{t('channel.stats')}</h3>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        {[
          [t('channel.subscribers'), data.subscribers],
          [t('channel.posts'), data.posts],
          [t('channel.avgViews'), data.avgViews],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div className="text-lg font-semibold text-fg-primary">{value}</div>
            <div className="text-xs text-fg-secondary">{label}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="text-xs text-fg-secondary mb-1">{t('channel.joins')}</div>
        <div className="flex items-end gap-1 h-12">
          {data.joinsByDay.map((d) => (
            <div key={d.date} title={`${d.date}: ${d.count}`} className="flex-1 bg-fg-accent/40 rounded-sm" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} />
          ))}
        </div>
      </div>
      {data.topPosts.length > 0 && (
        <ul className="space-y-1 text-sm">
          {data.topPosts.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span className="truncate text-fg-primary">{p.preview || '…'}</span>
              <span className="text-fg-secondary shrink-0">👁 {p.views} · 💬 {p.comments}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
