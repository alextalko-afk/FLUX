import { useState } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';

export interface Topic {
  id: string;
  title: string;
  iconEmoji: string | null;
  isClosed: boolean;
  messageCount: number;
}

export const GENERAL_TOPIC = 'general';

/** Topic switcher of a forum chat: "General" (no topic) plus the topics, admins can add and close. */
export function TopicBar({
  chatId,
  active,
  onChange,
  canManage,
}: {
  chatId: string;
  active: string;
  onChange: (topicId: string) => void;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const key = ['topics', chatId];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<{ items: Topic[] }>(`/chats/${chatId}/topics`) });
  const topics = data?.items ?? [];
  const current = topics.find((x) => x.id === active);

  const fail = (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('topics.failed'));
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const add = async () => {
    try {
      const created = await api.post<Topic>(`/chats/${chatId}/topics`, { title: title.trim() });
      setTitle('');
      setAdding(false);
      await refresh();
      onChange(created.id);
    } catch (err) {
      fail(err);
    }
  };

  const toggleClosed = async () => {
    if (!current) return;
    try {
      await api.patch(`/chats/${chatId}/topics/${current.id}`, { isClosed: !current.isClosed });
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  const chip = (id: string, label: string, closed = false) => (
    <button
      key={id}
      type="button"
      onClick={() => onChange(id)}
      className={`shrink-0 px-3 py-1 rounded-full text-sm border ${
        active === id ? 'border-fg-accent bg-fg-accent/10 text-fg-primary' : 'border-border text-fg-secondary'
      }`}
    >
      {closed ? '🔒 ' : ''}
      {label}
    </button>
  );

  return (
    <div className="px-3 py-2 border-b border-border-subtle space-y-2" data-testid="topic-bar">
      <div className="flex items-center gap-2 overflow-x-auto">
        {chip(GENERAL_TOPIC, t('topics.general'))}
        {topics.map((x) => chip(x.id, `${x.iconEmoji ? `${x.iconEmoji} ` : ''}${x.title}`, x.isClosed))}
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)} aria-label={t('topics.add')}>
            +
          </Button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2">
          <input
            value={title}
            maxLength={64}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('topics.title')}
            className="flex-1 bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-fg-primary"
          />
          <Button size="sm" onClick={add} disabled={!title.trim()}>
            {t('topics.create')}
          </Button>
        </div>
      )}
      {canManage && current && (
        <Button size="sm" variant="ghost" onClick={toggleClosed}>
          {current.isClosed ? t('topics.reopen') : t('topics.close')}
        </Button>
      )}
    </div>
  );
}
