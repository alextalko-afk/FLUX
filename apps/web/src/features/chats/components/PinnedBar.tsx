import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { realtime } from '../../../lib/realtime';
import { useI18n } from '../../../hooks/useI18n';
import { RichText } from '../../messages/components/RichText';

interface PinnedItem {
  id: string;
  message: { id: string; content: string; entities?: any[] | null; type?: string };
}

interface PinnedBarProps {
  chatId: string;
  /** Whether the viewer may unpin (the server enforces the same rule). */
  canManage: boolean;
  /** Scrolls the conversation to a message; false when it could not be found. */
  onJump: (messageId: string) => Promise<boolean> | boolean;
}

/**
 * Strip under the chat header that shows the pinned message. With several
 * pins, a click on the bar steps to the next one so each can be reached.
 */
export function PinnedBar({ chatId, canManage, onJump }: PinnedBarProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);

  const { data } = useQuery({
    queryKey: ['pinned', chatId],
    queryFn: () => api.get<{ items: PinnedItem[] }>(`/chats/${chatId}/messages/pinned`),
  });

  // Pins change from any device (and from other members), so the list is
  // refreshed by the realtime event instead of polling.
  useEffect(() => {
    return realtime.on('message.pin.updated', (payload) => {
      if (payload?.chatId === chatId) {
        void queryClient.invalidateQueries({ queryKey: ['pinned', chatId] });
      }
    });
  }, [chatId, queryClient]);

  const items = data?.items ?? [];

  // Keep the index valid when the list shrinks or the chat changes.
  useEffect(() => {
    setIndex(0);
  }, [chatId]);
  const current = items[Math.min(index, Math.max(items.length - 1, 0))];

  const unpin = useMutation({
    mutationFn: (messageId: string) => api.delete(`/chats/${chatId}/messages/${messageId}/pin`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pinned', chatId] }),
    onError: () => toast.error(t('messages.pinFailed')),
  });

  if (!current) return null;

  const jump = async () => {
    if (!(await onJump(current.message.id))) {
      toast(t('messages.pinnedNotLoaded'));
    }
    if (items.length > 1) setIndex((value) => (value + 1) % items.length);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle bg-bg-panel/70 text-sm">
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4 flex-shrink-0 text-fg-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7z" />
      </svg>

      <button
        type="button"
        onClick={() => void jump()}
        className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent rounded"
        aria-label={t('messages.pinnedJump')}
      >
        <div className="text-xs font-medium text-fg-accent">
          {t('messages.pinnedMessage')}
          {items.length > 1 && (
            <span className="text-fg-tertiary">
              {' '}
              · {Math.min(index, items.length - 1) + 1}/{items.length}
            </span>
          )}
        </div>
        <div className="truncate text-fg-secondary">
          {current.message.content ? (
            <RichText content={current.message.content} entities={current.message.entities} plain />
          ) : (
            t('chats.attachment')
          )}
        </div>
      </button>

      {canManage && (
        <button
          type="button"
          onClick={() => unpin.mutate(current.message.id)}
          disabled={unpin.isPending}
          className="p-1 rounded text-fg-tertiary hover:text-fg-primary hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent"
          aria-label={t('messages.unpin')}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
