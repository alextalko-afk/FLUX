import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';

/** Downloads the history of a chat as a JSON or HTML file; shows an error toast when it fails. */
export async function downloadChatExport(chatId: string, format: 'json' | 'html', fallbackError: string) {
  try {
    const blob = await api.getBlob(`/chats/${chatId}/export?format=${format}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat-${chatId.slice(0, 8)}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : fallbackError);
  }
}

/** Saves the chat history as a JSON or HTML file. */
export function ExportChat({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const download = (format: 'json' | 'html') => downloadChatExport(chatId, format, t('common.somethingWrong'));

  return (
    <section className="bg-bg-elevated border border-border rounded-panel shadow-panel p-3 flex items-center justify-between gap-2">
      <span className="text-sm text-fg-primary">{t('chatInfo.export')}</span>
      <span className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => void download('json')}>
          JSON
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void download('html')}>
          HTML
        </Button>
      </span>
    </section>
  );
}
