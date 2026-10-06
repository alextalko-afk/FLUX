import toast from 'react-hot-toast';
import { useState } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { api } from '../../../lib/api';

const OPTIONS = [0, 10, 30, 60, 300, 900, 3600];

const label = (seconds: number, off: string) =>
  seconds === 0 ? off : seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${seconds / 60} min` : '1 h';

/** Slow mode for a group: how rarely an ordinary member may post. Admins are exempt. */
export function SlowModeSection({ chatId, current }: { chatId: string; current: number }) {
  const { t } = useI18n();
  const [value, setValue] = useState(current);

  const change = async (next: number) => {
    const previous = value;
    setValue(next);
    try {
      await api.patch(`/chats/${chatId}`, { slowModeSeconds: next });
    } catch {
      setValue(previous);
      toast.error(t('common.somethingWrong'));
    }
  };

  return (
    <div className="bg-bg-elevated border border-border rounded-panel shadow-panel p-4 flex items-center justify-between gap-3">
      <div className="text-sm text-fg-primary">{t('messages.slowMode')}</div>
      <select
        value={value}
        onChange={(e) => void change(Number(e.target.value))}
        className="bg-bg-panel border border-border rounded-lg px-2 py-1 text-sm text-fg-primary"
      >
        {OPTIONS.map((seconds) => (
          <option key={seconds} value={seconds}>
            {label(seconds, t('messages.slowModeOff'))}
          </option>
        ))}
      </select>
    </div>
  );
}
