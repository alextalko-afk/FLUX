import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';

interface Comment {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  author: { firstName?: string; lastName?: string; username?: string } | null;
}

const name = (a: Comment['author']) => `${a?.firstName ?? ''} ${a?.lastName ?? ''}`.trim() || a?.username || '—';

/** "Comments (N)" under a channel post; opens the discussion in a dialog. */
export function CommentsButton({ chatId, messageId, count, canModerate }: { chatId: string; messageId: string; count: number; canModerate: boolean }) {
  const { t } = useI18n();
  const myId = useAuthStore((s) => s.user?.id);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const base = `/chats/${chatId}/messages/${messageId}/comments`;

  const load = useCallback(
    () =>
      api
        .get<{ items: Comment[] }>(base)
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [base],
  );

  // The count changes in realtime, so an open dialog reloads with it.
  useEffect(() => {
    if (open) void load();
  }, [open, count, load]);

  const fail = (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('channel.commentFailed'));

  const send = async () => {
    try {
      await api.post(base, { content: text.trim() });
      setText('');
      await load();
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`${base}/${id}`);
      await load();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-fg-accent hover:underline">
        💬 {count > 0 ? t('channel.commentsCount', { count: String(count) }) : t('channel.leaveComment')}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('channel.comments')} size="sm">
        <div className="p-5 space-y-3">
          {items.length === 0 && <div className="text-sm text-fg-secondary">{t('channel.noComments')}</div>}
          {items.map((c) => (
            <div key={c.id} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-fg-primary">{name(c.author)}</span>
                {(c.authorId === myId || canModerate) && (
                  <button type="button" className="text-xs text-fg-secondary" onClick={() => void remove(c.id)}>
                    {t('common.delete')}
                  </button>
                )}
              </div>
              <div className="text-fg-primary whitespace-pre-wrap break-words">{c.content}</div>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('channel.commentPlaceholder')}
              className="flex-1 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-fg-primary"
            />
            <Button onClick={send} disabled={!text.trim()}>
              {t('polls.send')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
