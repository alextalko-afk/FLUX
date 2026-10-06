import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface InlineResult {
  id: string;
  title: string;
  text: string;
}

const PATTERN = /^@([a-z0-9_]{3,32}) (.+)$/is;

/** Inline mode: typing `@bot query` shows the bot's suggestions above the composer. */
export function InlineBotResults({ value, onPick }: { value: string; onPick: (text: string) => void }) {
  const [state, setState] = useState<{ key: string; bot: string; items: InlineResult[] } | null>(null);
  const match = PATTERN.exec(value.trim());
  const key = match ? `${match[1]}|${match[2]}` : '';

  useEffect(() => {
    if (!match) return;
    const [, bot = '', q = ''] = match;
    let live = true;
    const timer = setTimeout(() => {
      api
        .get<{ bot: { name: string }; results: InlineResult[] }>(
          `/bots/inline?bot=${encodeURIComponent(bot)}&q=${encodeURIComponent(q)}`,
        )
        .then((r) => live && setState({ key, bot: r.bot.name, items: r.results }))
        .catch(() => live && setState(null));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match || state?.key !== key || state.items.length === 0) return null;
  return (
    <div className="mb-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-bg-elevated shadow-panel" data-testid="inline-results">
      <div className="px-3 pt-2 text-xs text-fg-secondary">{state.bot}</div>
      {state.items.map((r) => (
        <button key={r.id} type="button" onClick={() => onPick(r.text)} className="block w-full px-3 py-2 text-left hover:bg-bg-hover">
          <div className="text-sm font-medium text-fg-primary truncate">{r.title}</div>
          {r.title !== r.text && <div className="text-xs text-fg-secondary truncate">{r.text}</div>}
        </button>
      ))}
    </div>
  );
}
