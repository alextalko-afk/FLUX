import { useI18n } from '../../../hooks/useI18n';

/** Strip at the top of an end-to-end encrypted group: says it is encrypted, or why it is not readable here yet. */
export function GroupE2eeBanner({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === 'loading') return null;

  const problem = status !== 'ready';
  const text =
    status === 'ready'
      ? t('chats.e2eeGroupReady')
      : status === 'waiting'
        ? t('chats.e2eeGroupWaiting')
        : status === 'wrong-device'
          ? t('chats.secretWrongDevice')
          : t('chats.secretError');

  return (
    <div
      role={problem ? 'alert' : 'status'}
      className={`flex items-center gap-2 px-4 py-2 text-sm border-b border-border-subtle bg-bg-hover ${problem ? 'text-fg-error' : 'text-fg-secondary'}`}
      data-testid="group-e2ee-banner"
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span>{text}</span>
    </div>
  );
}
