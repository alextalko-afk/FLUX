import { useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuthStore } from '../../stores/auth.store';
import { useI18n } from '../../hooks/useI18n';
import { formatChatListTime } from '../../lib/format';
import { MessageStatusIcon } from '../../components/ui/MessageStatusIcon';
import { Avatar } from '../../components/ui/Avatar';
import { MessageContextMenu } from '../messages/components/MessageContextMenu';
import { useChatActions } from './hooks/useChatActions';
import { useFolders } from './hooks/useFolders';
import type { ChatListItem } from '../../stores/chats.store';

interface ChatListProps {
  chats: any[];
  /** Id of the chat currently open, used for the active rail. */
  activeChatId?: string | null;
}

/** Short label for a message that has no text body (photo, file, voice note). */
function previewLabel(type: string | undefined): string | null {
  switch (type) {
    case 'IMAGE':
      return '🖼';
    case 'VIDEO':
      return '🎬';
    case 'VOICE':
      return '🎤';
    case 'FILE':
    case 'DOCUMENT':
      return '📎';
    default:
      return null;
  }
}

export function ChatList({ chats, activeChatId }: ChatListProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { t, locale } = useI18n();
  const actions = useChatActions();
  const folders = useFolders();
  const [menu, setMenu] = useState<{ x: number; y: number; chat: ChatListItem } | null>(null);
  const pressTimer = useRef<number | null>(null);

  const openMenu = (chat: ChatListItem, x: number, y: number) => setMenu({ x, y, chat });

  // A long press opens the same menu on touch screens, which have no right click.
  const startPress = (chat: ChatListItem, event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    pressTimer.current = window.setTimeout(() => openMenu(chat, touch.clientX, touch.clientY), 550);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const menuItems = (chat: ChatListItem) => [
    ...(chat.isArchived
      ? []
      : [
          {
            label: chat.isPinned ? t('chats.unpinChat') : t('chats.pinChat'),
            onClick: () => void actions.setPinned(chat, !chat.isPinned),
          },
        ]),
    {
      label: chat.isMuted ? t('chats.unmuteChat') : t('chats.muteChat'),
      onClick: () => void actions.setMuted(chat, !chat.isMuted),
    },
    {
      label: chat.isArchived ? t('chats.unarchiveChat') : t('chats.archiveChat'),
      onClick: () => void actions.setArchived(chat, !chat.isArchived),
    },
    ...folders.map((folder) => ({
      label: folder.chatIds.includes(chat.id)
        ? t('chats.removeFromFolder', { name: folder.name })
        : t('chats.addToFolder', { name: folder.name }),
      onClick: () => void actions.toggleInFolder(chat, folder),
    })),
  ];

  return (
    <>
    <Virtuoso
      // Only the rows near the viewport are rendered, so an account with
      // thousands of chats opens as fast as one with three.
      style={{ height: '100%' }}
      data={chats}
      computeItemKey={(_, chat) => chat.id}
      increaseViewportBy={300}
      components={{
        Header: () => <div className="h-2" />,
        Footer: () => <div className="h-2" />,
      }}
      itemContent={(_, chat) => {
        const title =
          chat.title ||
          chat.members
            ?.filter((m: any) => m.userId !== user?.id)
            .map((m: any) => `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim())
            .filter(Boolean)
            .join(', ') ||
          t('search.chatFallback');

        const lastMsg = chat.lastMessage;
        const timeStr = lastMsg
          ? formatChatListTime(new Date(lastMsg.createdAt), locale)
          : '';

        const isOwn = !!lastMsg && lastMsg.senderId === user?.id;
        const isGroup = chat.type === 'GROUP' || chat.type === 'CHANNEL';
        // Own messages never show a sender name, so fall back to nothing
        // instead of rendering the literal "First name" label.
        const senderName = lastMsg?.sender?.firstName ?? '';
        const myMember = chat.members?.find((m: any) => m.userId === user?.id);
        const isMuted = Boolean(myMember?.isMuted);
        const isOnline =
          isGroup &&
          (chat.members || []).some(
            (m: any) => m.userId !== user?.id && m.user?.presence === 'ONLINE',
          );

        const isActive = activeChatId === chat.id;
        const icon = previewLabel(lastMsg?.type);
        const preview = lastMsg?.content?.trim() || '';
        // No message at all is not an "attachment": say so instead.
        // A secret chat's last message is ciphertext, which must never be shown as text.
        const previewText = !lastMsg
          ? t('chats.noMessagesYet')
          : chat.type === 'SECRET' || (chat as { e2ee?: boolean }).e2ee
            ? t('chats.secretMessagePreview')
            : preview || t('chats.attachment');

        return (
          <div className="px-2 pb-0.5">
          <button
            onClick={() => navigate(`/chats/${chat.id}`)}
            onContextMenu={(event) => {
              event.preventDefault();
              openMenu(chat, event.clientX, event.clientY);
            }}
            onTouchStart={(event) => startPress(chat, event)}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            className={clsx(
              'chat-row group relative w-full flex items-center gap-3.5 px-3 py-3 text-left',
              'rounded-2xl transition-colors duration-150',
              isActive ? 'bg-bg-active' : 'hover:bg-bg-hover',
            )}
          >
            <div className="relative flex-shrink-0">
              <Avatar
                name={title}
                avatarUrl={chat.avatarUrl}
                size="lg"
                isGroup={chat.type === 'GROUP'}
                isChannel={chat.type === 'CHANNEL'}
                className="transition-transform duration-200 ease-spring group-hover:scale-105"
              />
              {isMuted && (
                <span
                  className="absolute -right-0.5 -bottom-0.5 w-4 h-4 rounded-full bg-bg-panel flex items-center justify-center"
                  title={t('chatInfo.mute')}
                >
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-fg-tertiary" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2.5">
                <div
                  className={clsx(
                    'truncate text-[15px] leading-6 text-fg-primary',
                    chat.unreadCount > 0 ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {title}
                </div>
                <div
                  className={clsx(
                    'text-xs flex-shrink-0 tabular-nums',
                    chat.unreadCount > 0 ? 'text-fg-accent font-medium' : 'text-fg-tertiary',
                  )}
                >
                  {chat.isPinned && (
                    <svg
                      viewBox="0 0 24 24"
                      className="inline w-3 h-3 mr-1 -mt-0.5 text-fg-tertiary"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-label={t('chats.pinnedChat')}
                    >
                      <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7z" />
                    </svg>
                  )}
                  {timeStr}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2.5 mt-0.5">
                {/* In groups the sender is shown so the preview is unambiguous. */}
                <div className="text-[13.5px] text-fg-secondary truncate min-w-0 flex items-center gap-1.5">
                  {isOwn && (
                    <span className="text-fg-accent flex-shrink-0">
                      <MessageStatusIcon status={lastMsg?.status} />
                    </span>
                  )}
                  {isGroup && !isOwn && lastMsg && senderName && (
                    <span className="text-fg-accent truncate flex-shrink-0 max-w-[40%]">
                      {senderName}:
                    </span>
                  )}
                  {icon && <span className="flex-shrink-0">{icon}</span>}
                  {!isGroup && isOnline && (
                    <span className="w-1.5 h-1.5 rounded-full bg-fg-success flex-shrink-0" />
                  )}
                  <span className="truncate">{previewText}</span>
                </div>

                {chat.unreadCount > 0 ? (
                  <span className="flex-shrink-0 bg-fg-accent text-fg-on-accent text-2xs font-semibold px-1.5 h-5 min-w-[20px] inline-flex items-center justify-center rounded-full animate-pop-in shadow-accent">
                    {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                  </span>
                ) : (
                  <span className="flex-shrink-0 w-5" />
                )}
              </div>
            </div>
          </button>
          </div>
        );
      }}
    />
    {menu && (
      <MessageContextMenu
        x={menu.x}
        y={menu.y}
        items={menuItems(menu.chat)}
        onClose={() => setMenu(null)}
      />
    )}
    </>
  );
}
