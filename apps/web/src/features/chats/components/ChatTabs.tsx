import clsx from 'clsx';
import { useI18n } from '../../../hooks/useI18n';
import type { Folder } from '../hooks/useFolders';

export type ChatTab =
  | 'all'
  | 'personal'
  | 'groups'
  | 'channels'
  | 'muted'
  | 'archive'
  | `folder:${string}`;

interface ChatTabsProps {
  tab: ChatTab;
  onChange: (tab: ChatTab) => void;
  folders: Folder[];
  /** Unread messages per tab, shown as a small badge when above zero. */
  unread: Partial<Record<string, number>>;
  onManageFolders: () => void;
}

/** Filter strip above the chat list: built-in views, the user's folders and the archive. */
export function ChatTabs({ tab, onChange, folders, unread, onManageFolders }: ChatTabsProps) {
  const { t } = useI18n();

  const tabs: Array<{ id: ChatTab; label: string }> = [
    { id: 'all', label: t('chats.tabAll') },
    ...folders.map((folder) => ({ id: `folder:${folder.id}` as ChatTab, label: folder.name })),
    { id: 'personal', label: t('chats.tabPersonal') },
    { id: 'groups', label: t('chats.tabGroups') },
    { id: 'channels', label: t('chats.tabChannels') },
    { id: 'muted', label: t('chats.tabMuted') },
    { id: 'archive', label: t('chats.tabArchive') },
  ];

  return (
    <div className="flex items-start gap-1 pl-4 pr-2 pt-1 pb-3">
      <div
        role="tablist"
        aria-label={t('chats.tabsLabel')}
        className="flex-1 min-w-0 flex flex-wrap gap-x-1 gap-y-1.5"
      >
        {tabs.map(({ id, label }) => {
          const selected = tab === id;
          const count = unread[id] ?? 0;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(id)}
              className={clsx(
                'flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent',
                selected
                  ? 'bg-fg-accent text-fg-on-accent font-medium'
                  : 'text-fg-secondary hover:bg-bg-hover hover:text-fg-primary',
              )}
            >
              <span className="max-w-[9rem] truncate">{label}</span>
              {count > 0 && (
                <span
                  className={clsx(
                    'min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-2xs font-semibold inline-flex items-center justify-center',
                    selected ? 'bg-fg-on-accent/25 text-fg-on-accent' : 'bg-fg-accent text-fg-on-accent',
                  )}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onManageFolders}
        title={t('chats.foldersManage')}
        aria-label={t('chats.foldersManage')}
        className="flex-shrink-0 p-1.5 mt-px rounded-full text-fg-tertiary hover:text-fg-primary hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      </button>
    </div>
  );
}
