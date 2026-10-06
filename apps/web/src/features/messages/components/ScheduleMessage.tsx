import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Tooltip } from '../../../components/ui/Tooltip';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';
import { parseMarkdown } from '../../../lib/richText';

interface Scheduled {
  id: string;
  content: string;
  sendAt: string;
}

/** `datetime-local` wants local time without a zone; this is "now + 1 hour". */
function defaultTime(): string {
  const date = new Date(Date.now() + 3_600_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

/** Clock button next to Send: schedules the typed text and lists/cancels pending ones. */
export function ScheduleMessage({
  chatId,
  text,
  onScheduled,
}: {
  chatId: string;
  text: string;
  onScheduled: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(defaultTime);
  const [items, setItems] = useState<Scheduled[]>([]);
  const [busy, setBusy] = useState(false);
  const base = `/chats/${chatId}/messages/scheduled`;

  const load = () =>
    api
      .get<{ items: Scheduled[] }>(base)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));

  useEffect(() => {
    if (open) {
      setWhen(defaultTime());
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatId]);

  const submit = async () => {
    const sendAt = new Date(when);
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() < Date.now() + 10_000) {
      toast.error(t('messages.scheduleInvalid'));
      return;
    }
    const parsed = parseMarkdown(text.trim());
    const content = parsed.text.trim() ? parsed.text : text.trim();
    setBusy(true);
    try {
      await api.post(base, {
        content,
        entities: parsed.text.trim() && parsed.entities.length > 0 ? parsed.entities : undefined,
        sendAt: sendAt.toISOString(),
      });
      toast.success(t('messages.scheduleDone'));
      onScheduled();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('messages.scheduleFailed'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    await api.delete(`${base}/${id}`).catch(() => undefined);
    void load();
  };

  return (
    <>
      <Tooltip label={t('messages.scheduleHint')} side="top">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={t('messages.scheduleHint')}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        </Button>
      </Tooltip>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('messages.scheduleTitle')} size="sm">
        <div className="p-5 space-y-4">
          <label className="block text-sm text-fg-secondary">
            {t('messages.scheduleAt')}
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-1 w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-fg-primary"
            />
          </label>
          <Button className="w-full" onClick={submit} isLoading={busy} disabled={!text.trim()}>
            {t('messages.scheduleConfirm')}
          </Button>

          {items.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border-subtle">
              <div className="text-xs uppercase text-fg-tertiary">{t('messages.scheduledList')}</div>
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-fg-primary">{item.content}</div>
                    <div className="text-xs text-fg-secondary">{new Date(item.sendAt).toLocaleString()}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void cancel(item.id)}>
                    {t('messages.scheduledCancel')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
