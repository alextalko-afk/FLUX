import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { api } from '../../../lib/api';

interface Person {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}
interface Entry {
  id: string;
  action: string;
  createdAt: string;
  actor: Person | null;
  target: Person | null;
  details?: { changed?: string[] } | null;
}

const KEY: Record<string, string> = {
  'chat.updated': 'chatInfo.logChatUpdated',
  'member.added': 'chatInfo.logMemberAdded',
  'member.removed': 'chatInfo.logMemberRemoved',
  'member.role': 'chatInfo.logMemberRole',
  'invite.rotated': 'chatInfo.logInviteRotated',
  'invite.revoked': 'chatInfo.logInviteRevoked',
  'join.approved': 'chatInfo.logJoinApproved',
  'join.rejected': 'chatInfo.logJoinRejected',
};

const fieldLabel = (t: (key: string) => string, field: string) => {
  const key = `chatInfo.logField_${field}`;
  const label = t(key);
  return label === key ? field : label;
};

const nameOf = (p: Person | null) =>
  p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.username || '—' : '—';

/** Collapsed list of what administrators did; loaded only when opened. */
export function AdminLogSection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['admin-log', chatId],
    queryFn: () => api.get<{ items: Entry[] }>(`/chats/${chatId}/admin-log`),
    enabled: open,
  });

  return (
    <section className="space-y-2">
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-full text-left text-sm font-semibold text-fg-primary uppercase tracking-wide px-1"
        aria-expanded={open}
      >
        {t('chatInfo.adminLog')} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="bg-bg-elevated border border-border rounded-panel shadow-panel divide-y divide-border-subtle">
          {(data?.items ?? []).length === 0 && (
            <div className="p-3 text-sm text-fg-secondary">{t('chatInfo.adminLogEmpty')}</div>
          )}
          {(data?.items ?? []).map((entry) => (
            <div key={entry.id} className="p-3 text-sm text-fg-primary">
              <span className="font-medium">{nameOf(entry.actor)}</span> {t(KEY[entry.action] ?? 'chatInfo.logChatUpdated')}
              {entry.action === 'chat.updated' && entry.details?.changed?.length ? `: ${entry.details.changed.map((f) => fieldLabel(t, f)).join(', ')}` : ''}
              {entry.target && <span className="font-medium"> {nameOf(entry.target)}</span>}
              <div className="text-xs text-fg-tertiary">{new Date(entry.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
