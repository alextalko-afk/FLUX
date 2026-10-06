import { useEffect, useMemo, useState } from 'react';
import { useResizableWidth } from '../hooks/useResizableWidth';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useChatsStore } from '../stores/chats.store';
import { useUiStore } from '../stores/ui.store';
import { useAuthStore } from '../stores/auth.store';
import { ChatList } from '../features/chats/ChatList';
import { ChatView } from '../features/chats/ChatView';
import { StoriesBar } from '../features/stories/StoriesBar';
import { ChatTabs, type ChatTab } from '../features/chats/components/ChatTabs';
import { FolderEditor } from '../features/chats/components/FolderEditor';
import { useFolders } from '../features/chats/hooks/useFolders';
import type { ChatListItem } from '../stores/chats.store';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useI18n } from '../hooks/useI18n';

export function ChatsPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { setChats, setActiveChatId, chats } = useChatsStore();
  const { setSidebarOpen } = useUiStore();
  const { user } = useAuthStore();
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<ChatTab>('all');
  const list = useResizableWidth('flux-list-width', 384, 280, 560);
  const [isEditingFolders, setIsEditingFolders] = useState(false);
  const folders = useFolders();

  const { isLoading } = useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const result = await api.get<{ items: any[] }>('/chats');
      setChats(result.items);
      return result.items;
    },
  });

  // The archive is loaded on demand: it is not part of the main list.
  const { data: archived, isLoading: isLoadingArchive } = useQuery({
    queryKey: ['chats', 'archived'],
    queryFn: () => api.get<{ items: ChatListItem[] }>('/chats?archived=true'),
    enabled: tab === 'archive' || Boolean(chatId),
  });
  const archivedChats = archived?.items ?? [];

  useEffect(() => {
    setActiveChatId(chatId || null);
  }, [chatId, setActiveChatId]);

  // A folder that was deleted (here or on another device) must not stay selected.
  useEffect(() => {
    if (tab.startsWith('folder:') && !folders.some((folder) => `folder:${folder.id}` === tab)) {
      setTab('all');
    }
  }, [tab, folders]);

  const inTab = (chat: ChatListItem, which: ChatTab): boolean => {
    switch (which) {
      case 'all':
        return true;
      case 'personal':
        return chat.type === 'PRIVATE' || chat.type === 'SAVED' || chat.type === 'SECRET';
      case 'groups':
        return chat.type === 'GROUP';
      case 'channels':
        return chat.type === 'CHANNEL';
      case 'muted':
        return Boolean(chat.isMuted);
      case 'archive':
        return true;
      default: {
        const folder = folders.find((item) => `folder:${item.id}` === which);
        return Boolean(folder?.chatIds.includes(chat.id));
      }
    }
  };

  const unreadByTab = useMemo(() => {
    const totals: Record<string, number> = {};
    const tabIds: ChatTab[] = [
      'all',
      'personal',
      'groups',
      'channels',
      'muted',
      ...folders.map((folder) => `folder:${folder.id}` as ChatTab),
    ];
    for (const id of tabIds) {
      // Muted chats do not add to the badge of the other tabs: muting means "do not nag me".
      totals[id] = chats
        .filter((chat) => inTab(chat, id) && (id === 'muted' || !chat.isMuted))
        .reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
    }
    return totals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, folders]);

  const sourceChats = tab === 'archive' ? archivedChats : chats;

  const visibleChats = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const scoped = sourceChats.filter((chat) => inTab(chat, tab));
    if (!q) return scoped;
    return scoped.filter((chat) => {
      if (chat.title?.toLowerCase().includes(q)) return true;
      if (chat.lastMessage?.content?.toLowerCase().includes(q)) return true;
      return (chat.members || []).some((m: any) => {
        if (m.userId === user?.id) return false;
        const name = `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim().toLowerCase();
        return name.includes(q) || m.user?.username?.toLowerCase().includes(q);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceChats, filter, user?.id, tab, folders]);

  const activeChat = chats.find((c) => c.id === chatId) ?? archivedChats.find((c) => c.id === chatId);

  return (
    <>
      <div
        className={`${
          chatId ? 'hidden md:flex' : 'flex'
        } relative w-full md:w-[var(--list-w)] flex-col flex-shrink-0 border-r border-border-subtle bg-bg-panel`}
        style={{ ['--list-w' as string]: `${list.width}px` }}
      >
        <div
          {...list.handleProps}
          role="separator"
          aria-orientation="vertical"
          title="Потяните, чтобы изменить ширину"
          className="hidden md:block absolute top-0 -right-1 h-full w-2 z-20 cursor-col-resize hover:bg-fg-accent/30 active:bg-fg-accent/50 transition-colors"
        />
        <div className="px-4 pt-5 pb-3 flex items-center gap-2">
          <button
            className="md:hidden p-2 rounded-lg hover:bg-bg-hover"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('nav.openMenu')}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-fg-primary flex-1">{t('chats.title')}</h1>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate('/chats/new')}
            aria-label={t('chats.newChat')}
            title={t('chats.newChat')}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Button>
        </div>
        <div className="px-4 pb-3">
          <input
            type="search"
            placeholder={t('chats.searchPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-4 py-2.5 bg-bg-sunken border border-transparent rounded-full text-sm placeholder:text-fg-tertiary focus:outline-none focus:bg-bg-panel focus:border-fg-accent/50 focus:ring-2 focus:ring-fg-accent/20 transition-colors"
          />
        </div>
        <StoriesBar />
        <ChatTabs
          tab={tab}
          onChange={setTab}
          folders={folders}
          unread={unreadByTab}
          onManageFolders={() => setIsEditingFolders(true)}
        />
        <FolderEditor isOpen={isEditingFolders} onClose={() => setIsEditingFolders(false)} />
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading || (tab === 'archive' && isLoadingArchive) ? (
            <div className="p-3 space-y-3 enter-stagger" aria-label={t('common.loading')}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <div className="w-12 h-12 rounded-full skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-1/3 rounded skeleton" />
                    <div className="h-3 w-2/3 rounded skeleton" />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'archive' && archivedChats.length === 0 ? (
            <div className="p-6 text-center text-sm text-fg-secondary">{t('chats.archiveEmpty')}</div>
          ) : tab !== 'archive' && chats.length === 0 ? (
            <EmptyState
              title={t('chats.noChats')}
              description={t('chats.noChatsDescription')}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
            />
          ) : visibleChats.length === 0 ? (
            <div className="p-4 text-center text-sm text-fg-secondary">
              {filter.trim() ? t('chats.noMatch', { query: filter }) : t('chats.tabEmpty')}
            </div>
          ) : (
            <ChatList chats={visibleChats} activeChatId={chatId ?? null} />
          )}
        </div>
      </div>

      <div
        className={`${
          chatId ? 'flex' : 'hidden md:flex'
        } min-w-0 flex-1 flex-col chat-wallpaper`}
      >
        {activeChat ? (
          <ChatView chat={activeChat} />
        ) : (
          <EmptyState
            title={t('chats.selectChat')}
            description={t('chats.selectChatDescription')}
          />
        )}
      </div>
    </>
  );
}
