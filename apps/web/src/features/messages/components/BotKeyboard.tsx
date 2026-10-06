import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';

interface BotButton {
  text: string;
  callbackData?: string;
  webAppUrl?: string;
}

export interface BotCard {
  text: string;
  keyboard: { row: BotButton[] }[];
}

/** Bot messages with buttons carry `{ text, keyboard }` as JSON in `content`; anything else is plain text. */
export function parseBotCard(content: string): BotCard | null {
  if (!content.startsWith('{"text"')) return null;
  try {
    const card = JSON.parse(content);
    return typeof card.text === 'string' && Array.isArray(card.keyboard) ? (card as BotCard) : null;
  } catch {
    return null;
  }
}

/**
 * A bot's mini-app inside the messenger. The page runs in a sandboxed frame and receives the signed
 * `initData` in the URL fragment (`#fluxInitData=...`), which never reaches the page's server; it can ask
 * to be closed with `parent.postMessage({ type: 'flux:close' }, '*')`.
 */
function MiniApp({ title, url, initData, onClose }: { title: string; url: string; initData: string; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === 'flux:close') onClose();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose]);

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <iframe
        ref={frame}
        title={title}
        src={`${url}#fluxInitData=${encodeURIComponent(initData)}`}
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
        className="w-full h-[70vh] rounded-lg border border-border bg-white"
        data-testid="mini-app-frame"
      />
    </Modal>
  );
}

export function BotKeyboard({ messageId, card }: { messageId: string; card: BotCard }) {
  const { t } = useI18n();
  const [pressed, setPressed] = useState<string | null>(null);
  const [app, setApp] = useState<{ title: string; url: string; initData: string } | null>(null);

  const fail = (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));

  const press = async (button: BotButton) => {
    const key = button.callbackData ?? button.webAppUrl ?? button.text;
    setPressed(key);
    try {
      if (button.webAppUrl) {
        const session = await api.post<{ url: string; initData: string }>('/bots/webapp', { messageId, url: button.webAppUrl });
        setApp({ title: button.text, ...session });
      } else if (button.callbackData) {
        await api.post('/bots/callback', { messageId, data: button.callbackData });
      }
    } catch (err) {
      fail(err);
    } finally {
      setPressed(null);
    }
  };

  return (
    <div className="mt-2 space-y-1" data-testid="bot-keyboard">
      {card.keyboard.map((r, i) => (
        <div key={i} className="flex gap-1">
          {r.row.map((b, j) => (
            <button
              key={b.callbackData ?? b.webAppUrl ?? j}
              disabled={pressed !== null}
              onClick={() => void press(b)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-fg-accent/15 text-fg-accent text-sm hover:bg-fg-accent/25 disabled:opacity-50"
            >
              {b.webAppUrl ? '↗ ' : ''}
              {b.text}
            </button>
          ))}
        </div>
      ))}
      {app && <MiniApp {...app} onClose={() => setApp(null)} />}
    </div>
  );
}
