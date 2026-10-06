import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';
import { useMessagesStore } from '../../../stores/messages.store';

export interface PollView {
  id: string;
  question: string;
  isAnonymous: boolean;
  multiple: boolean;
  isQuiz: boolean;
  isClosed: boolean;
  totalVoters: number;
  myOptionIds: string[];
  correctOptionId: string | null;
  explanation: string | null;
  options: { id: string; text: string; votes: number }[];
}

export function PollCard({
  chatId,
  messageId,
  poll,
  canClose,
}: {
  chatId: string;
  messageId: string;
  poll: PollView;
  canClose: boolean;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const voted = poll.myOptionIds.length > 0;
  const showResults = voted || poll.isClosed;

  const apply = (next: PollView) =>
    useMessagesStore.getState().updateMessage(chatId, messageId, { poll: next } as any);

  const run = async (fn: () => Promise<PollView>) => {
    setBusy(true);
    try {
      apply(await fn());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('polls.failed'));
    } finally {
      setBusy(false);
    }
  };

  const vote = (ids: string[]) => run(() => api.post<PollView>(`/polls/${poll.id}/vote`, { optionIds: ids }));
  const onOption = (id: string) => {
    if (poll.isClosed || (poll.isQuiz && voted)) return;
    if (poll.multiple) setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    else void vote([id]);
  };

  return (
    <div className="min-w-[220px] space-y-2" data-testid="poll-card">
      <div className="text-sm font-semibold text-fg-primary">{poll.question}</div>
      <div className="text-xs text-fg-secondary">
        {poll.isQuiz ? t('polls.quiz') : poll.isAnonymous ? t('polls.anonymous') : t('polls.public')}
        {poll.isClosed ? ` · ${t('polls.closed')}` : ''}
      </div>
      {poll.options.map((o) => {
        const pct = poll.totalVoters ? Math.round((o.votes / poll.totalVoters) * 100) : 0;
        const mine = poll.myOptionIds.includes(o.id);
        const correct = poll.correctOptionId === o.id;
        const wrong = poll.isQuiz && mine && poll.correctOptionId && !correct;
        return (
          <button
            key={o.id}
            type="button"
            disabled={busy}
            onClick={() => onOption(o.id)}
            className={`relative w-full text-left rounded-lg border px-3 py-1.5 text-sm overflow-hidden ${
              picked.includes(o.id) || mine ? 'border-fg-accent' : 'border-border'
            }`}
          >
            {showResults && (
              <span
                className={`absolute inset-y-0 left-0 ${correct ? 'bg-green-500/25' : wrong ? 'bg-red-500/25' : 'bg-fg-accent/15'}`}
                style={{ width: `${pct}%` }}
              />
            )}
            <span className="relative flex justify-between gap-2">
              <span>
                {correct ? '✓ ' : wrong ? '✗ ' : mine ? '● ' : ''}
                {o.text}
              </span>
              {showResults && <span className="text-fg-secondary">{pct}%</span>}
            </span>
          </button>
        );
      })}
      {poll.explanation && <div className="text-xs text-fg-secondary">{poll.explanation}</div>}
      <div className="flex items-center gap-2 text-xs text-fg-secondary">
        <span>{t('polls.voters', { count: String(poll.totalVoters) })}</span>
        {poll.multiple && !poll.isClosed && picked.length > 0 && (
          <Button size="sm" onClick={() => void vote(picked)} isLoading={busy}>
            {t('polls.vote')}
          </Button>
        )}
        {voted && !poll.isQuiz && !poll.isClosed && (
          <Button size="sm" variant="ghost" onClick={() => void run(() => api.delete<PollView>(`/polls/${poll.id}/vote`))}>
            {t('polls.retract')}
          </Button>
        )}
        {canClose && !poll.isClosed && (
          <Button size="sm" variant="ghost" onClick={() => void run(() => api.post<PollView>(`/polls/${poll.id}/close`, {}))}>
            {t('polls.close')}
          </Button>
        )}
      </div>
    </div>
  );
}
