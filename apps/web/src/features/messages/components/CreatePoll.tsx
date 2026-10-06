import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Tooltip } from '../../../components/ui/Tooltip';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';

export function CreatePoll({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isAnonymous, setAnonymous] = useState(true);
  const [multiple, setMultiple] = useState(false);
  const [isQuiz, setQuiz] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim() && filled.length >= 2 && (!isQuiz || options[correct]?.trim());

  const submit = async () => {
    setBusy(true);
    try {
      // Blank rows are dropped, so the quiz answer index must follow the filled list.
      const correctOption = options.slice(0, correct).filter((o) => o.trim()).length;
      await api.post(`/chats/${chatId}/polls`, {
        question: question.trim(),
        options: filled,
        isAnonymous,
        multiple: isQuiz ? false : multiple,
        isQuiz,
        ...(isQuiz ? { correctOption, explanation: explanation.trim() || undefined } : {}),
      });
      setOpen(false);
      setQuestion('');
      setOptions(['', '']);
      setQuiz(false);
      setMultiple(false);
      setExplanation('');
      setCorrect(0);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('polls.failed'));
    } finally {
      setBusy(false);
    }
  };

  const check = (label: string, value: boolean, set: (v: boolean) => void, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <>
      <Tooltip label={t('polls.create')} side="top">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={t('polls.create')}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="20" x2="6" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="18" y1="20" x2="18" y2="14" />
          </svg>
        </Button>
      </Tooltip>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('polls.create')} size="sm">
        <div className="p-5 space-y-3">
          <input
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('polls.question')}
            className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-fg-primary"
          />
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              {isQuiz && <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} />}
              <input
                value={o}
                maxLength={100}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`${t('polls.option')} ${i + 1}`}
                className="flex-1 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-fg-primary"
              />
            </div>
          ))}
          {options.length < 10 && (
            <Button size="sm" variant="ghost" onClick={() => setOptions((p) => [...p, ''])}>
              {t('polls.addOption')}
            </Button>
          )}
          {check(t('polls.anonymous'), isAnonymous, setAnonymous)}
          {check(t('polls.multiple'), multiple && !isQuiz, setMultiple, isQuiz)}
          {check(t('polls.quiz'), isQuiz, setQuiz)}
          {isQuiz && (
            <input
              value={explanation}
              maxLength={200}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder={t('polls.explanation')}
              className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-fg-primary"
            />
          )}
          <Button className="w-full" onClick={submit} isLoading={busy} disabled={!valid}>
            {t('polls.send')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
