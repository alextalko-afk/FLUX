import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Tooltip } from '../../../components/ui/Tooltip';
import { useI18n } from '../../../hooks/useI18n';
import { ApiError } from '../../../lib/api';
import { useGroupCallStore } from '../../../stores/groupCall.store';
import { GroupCallScreen } from './GroupCallScreen';

/** Mounted once in the app layout so a call survives switching chats. */
export function GroupCallManager() {
  const session = useGroupCallStore((s) => s.session);
  return session ? <GroupCallScreen session={session} /> : null;
}

/** Header button of a group or channel; hidden when the server has no SFU configured. */
export function GroupCallButton({ chatId, chatType }: { chatId: string; chatType: string }) {
  const { t } = useI18n();
  const load = useGroupCallStore((s) => s.load);
  const configured = useGroupCallStore((s) => s.configured[chatId]);
  const call = useGroupCallStore((s) => s.byChat[chatId]);
  const inCall = useGroupCallStore((s) => s.session?.chatId === chatId);
  const start = useGroupCallStore((s) => s.start);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (chatType === 'GROUP' || chatType === 'CHANNEL') void load(chatId);
  }, [chatId, chatType, load]);

  if ((chatType !== 'GROUP' && chatType !== 'CHANNEL') || !configured || inCall) return null;

  const click = async () => {
    setBusy(true);
    try {
      await start(chatId, false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('groupCall.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip label={call ? t('groupCall.join') : t('groupCall.start')} side="bottom">
      <Button size="sm" variant="ghost" onClick={click} isLoading={busy} aria-label={call ? t('groupCall.join') : t('groupCall.start')}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </Button>
    </Tooltip>
  );
}

/** "A call is running — join" strip under the chat header. */
export function GroupCallBanner({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const call = useGroupCallStore((s) => s.byChat[chatId]);
  const inCall = useGroupCallStore((s) => s.session?.chatId === chatId);
  const join = useGroupCallStore((s) => s.join);
  if (!call || inCall) return null;

  return (
    <div className="px-3 py-2 flex items-center justify-between gap-2 bg-fg-accent/10 border-b border-border-subtle text-sm" data-testid="group-call-banner">
      <span className="text-fg-primary inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-fg-success animate-pulse" />
        {t('groupCall.running')} · {t('groupCall.participants', { count: String(call.participants.length) })}
      </span>
      <Button
        size="sm"
        onClick={() =>
          void join(call.id).catch((err) => toast.error(err instanceof ApiError ? err.message : t('groupCall.failed')))
        }
      >
        {t('groupCall.join')}
      </Button>
    </div>
  );
}
