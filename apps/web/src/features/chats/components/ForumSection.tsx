import toast from 'react-hot-toast';
import { useState } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { api } from '../../../lib/api';

/** Turns a group into a forum with topics. */
export function ForumSection({ chatId, current }: { chatId: string; current: boolean }) {
  const { t } = useI18n();
  const [value, setValue] = useState(current);

  const change = async (next: boolean) => {
    setValue(next);
    try {
      await api.patch(`/chats/${chatId}`, { isForum: next });
    } catch {
      setValue(!next);
      toast.error(t('common.somethingWrong'));
    }
  };

  return (
    <label className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4 flex items-center justify-between gap-3 text-sm text-fg-primary">
      {t('topics.forumMode')}
      <input type="checkbox" checked={value} onChange={(e) => void change(e.target.checked)} />
    </label>
  );
}
