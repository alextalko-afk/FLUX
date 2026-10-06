import { useState, MouseEvent, KeyboardEvent, useEffect } from 'react';
import clsx from 'clsx';
import { formatTime } from '../../../lib/format';
import { MessageContextMenu } from './MessageContextMenu';
import { MessageStatusIcon } from '../../../components/ui/MessageStatusIcon';
import { ReactionPicker } from './ReactionPicker';
import { MessageAttachment } from '../../media/components/MessageAttachment';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../lib/api';
import { BotKeyboard, parseBotCard } from './BotKeyboard';
import toast from 'react-hot-toast';
import { useI18n } from '../../../hooks/useI18n';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../../components/ui/Avatar';
import { decryptForChat } from '../../../services/e2ee/secretSessions';
import { useAuthStore } from '../../../stores/auth.store';
import { isEmojiOnly } from '../../../lib/format';
import { getChatType, isE2eeChat, useChatsStore } from '../../../stores/chats.store';
import { decryptForGroup } from '../../../services/e2ee/groupSessions';
import { CommentsButton } from './CommentsButton';
import { RichText } from './RichText';
import { useCanPin } from '../../chats/hooks/useCanPin';
import { useMessagesStore } from '../../../stores/messages.store';
import { PollCard } from './PollCard';
import { LocationCard } from './LocationCard';
import { StickerImage } from './StickerPicker';
import { LinkPreviewCard, firstUrl } from './LinkPreviewCard';
import { parseMarkdown, sortEntities, toMarkdown } from '../../../lib/richText';

interface MessageBubbleProps {
  message: any;
  isOwn: boolean;
  showAvatar: boolean;
  /** Last bubble of a run from the same sender: only this one gets a tail. */
  isLastInGroup: boolean;
  chatId: string;
  onReply?: (message: any) => void;
}

/**
 * Text shown in the edit box. Formatted messages are turned back into markup so
 * editing keeps the bold/code/links; secret chats carry ciphertext and no
 * entities, so they are edited as they are.
 */
function editableText(message: any, isSecret: boolean): string {
  const content: string = message.content || '';
  return isSecret ? content : toMarkdown(content, message.entities);
}

/** Placeholders such as "[Decryption Error]" are UI text, not the sender's words. */
function isPlaceholder(text: string | null): boolean {
  return text !== null && text.startsWith('[') && text.endsWith(']') && text.length < 40;
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar,
  isLastInGroup,
  chatId,
  onReply,
}: MessageBubbleProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [reactionPicker, setReactionPicker] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const isGroupE2ee = isE2eeChat(chatId);
  const isSecret = getChatType(chatId) === 'SECRET' || isGroupE2ee;
  const isPrivate = getChatType(chatId) === 'PRIVATE';
  const commentsOn = useChatsStore((s) => Boolean((s.chats.find((c) => c.id === chatId) as { commentsEnabled?: boolean } | undefined)?.commentsEnabled));
  const canPin = useCanPin(chatId);
  const isPinned = Boolean(message.pin);
  const [editValue, setEditValue] = useState(() => editableText(message, isSecret));
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const botCard = parseBotCard(message.content || '');
  const [translation, setTranslation] = useState<string | null>(null);

  const myId = useAuthStore((state) => state.user?.id) ?? '';

  useEffect(() => {
    let cancelled = false;

    async function decrypt() {
      if (!message.content) return;
      if (!isSecret) {
        setDecryptedContent(message.content);
        return;
      }
      try {
        const text = isGroupE2ee
          ? await decryptForGroup(chatId, myId, message.content)
          : await decryptForChat(chatId, myId, message.content);
        if (!cancelled) setDecryptedContent(text);
      } catch {
        // Wrong device, revoked key, or a message that was tampered with.
        if (!cancelled) setDecryptedContent(`[${t('chats.secretUndecryptable')}]`);
      }
    }

    void decrypt();
    return () => {
      cancelled = true;
    };
  }, [message.content, chatId, isSecret, isGroupE2ee, myId, t]);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/chats/${chatId}/messages/${message.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
      toast.success(t('messages.deletedToast'));
    },
    onError: () => {
      toast.error(t('messages.deleteFailed'));
    },
  });

  const pinMutation = useMutation({
    mutationFn: (pin: boolean) =>
      pin
        ? api.post(`/chats/${chatId}/messages/${message.id}/pin`)
        : api.delete(`/chats/${chatId}/messages/${message.id}/pin`),
    onSuccess: (_result, pin) => {
      // The realtime event does this for everyone else; do it here too so the
      // menu label flips immediately for the person who pinned.
      useMessagesStore
        .getState()
        .updateMessage(chatId, message.id, { pin: pin ? { id: message.id } : null } as any);
      queryClient.invalidateQueries({ queryKey: ['pinned', chatId] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError && err.code === 'PIN_LIMIT_REACHED'
          ? t('messages.pinLimit')
          : t('messages.pinFailed'),
      );
    },
  });

  const editMutation = useMutation({
    mutationFn: (payload: { content: string; entities?: ReturnType<typeof parseMarkdown>['entities'] }) =>
      api.post(`/chats/${chatId}/messages/${message.id}/edit`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
      setIsEditing(false);
      toast.success(t('messages.updated'));
    },
    onError: () => {
      toast.error(t('messages.editFailed'));
    },
  });

  const reactMutation = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/chats/${chatId}/messages/${message.id}/react`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
    onError: () => {
      toast.error(t('messages.reactionFailed'));
    },
  });

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleReactionClick = (e: MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setReactionPicker({ x: rect.left, y: rect.top });
  };

  const saveEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setIsEditing(false);
      return;
    }

    if (isSecret) {
      if (trimmed === message.content) {
        setIsEditing(false);
        return;
      }
      editMutation.mutate({ content: trimmed });
      return;
    }

    const parsed = parseMarkdown(trimmed);
    const nextText = parsed.text.trim() ? parsed.text : trimmed;
    const nextEntities = parsed.text.trim() ? parsed.entities : [];
    const unchanged =
      nextText === message.content &&
      JSON.stringify(nextEntities) === JSON.stringify(sortEntities(message.entities ?? []));
    if (unchanged) {
      setIsEditing(false);
      return;
    }

    // Always send the entity list (even empty): leaving it out would keep the
    // old ranges, which no longer match the edited text.
    editMutation.mutate({ content: nextText, entities: nextEntities });
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
    }
  };

  const contextMenuItems = [
    {
      label: t('messages.reply'),
      hint: t('messages.replyHint'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
      ),
      onClick: () => onReply?.(message),
    },
    {
      label: t('messages.copy'),
      hint: t('messages.copyHint'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      ),
      onClick: () => {
        navigator.clipboard.writeText(message.content);
        toast.success(t('messages.copied'));
      },
    },
    ...(!isSecret && message.type === 'VOICE' && !message.isDeleted && message.status !== 'SENDING' && message.status !== 'FAILED'
      ? [
          {
            label: translation ? t('messages.hideTranslation') : t('messages.transcribe'),
            hint: t('messages.transcribeHint'),
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            ),
            onClick: async () => {
              if (translation) return setTranslation(null);
              try {
                const res = await api.post<{ text: string }>(`/messages/${message.id}/transcribe`, {});
                setTranslation(res.text || '…');
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
              }
            },
          },
        ]
      : []),
    ...(!isSecret && message.content && !message.isDeleted && message.status !== 'SENDING' && message.status !== 'FAILED'
      ? [
          {
            label: translation ? t('messages.hideTranslation') : t('messages.translate'),
            hint: t('messages.translateHint'),
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />
              </svg>
            ),
            onClick: async () => {
              if (translation) return setTranslation(null);
              try {
                const res = await api.post<{ text: string }>(`/messages/${message.id}/translate`, { to: locale });
                setTranslation(res.text);
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
              }
            },
          },
        ]
      : []),
    ...(canPin && !message.isDeleted && message.status !== 'SENDING' && message.status !== 'FAILED'
      ? [
          {
            label: isPinned ? t('messages.unpin') : t('messages.pin'),
            hint: t('messages.pinHint'),
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7z" />
              </svg>
            ),
            onClick: () => pinMutation.mutate(!isPinned),
          },
        ]
      : []),
    ...(isOwn && !message.isDeleted
      ? [
          {
            label: t('messages.edit'),
      hint: t('messages.editHint'),
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ),
            onClick: () => {
              setEditValue(editableText(message, isSecret));
              setIsEditing(true);
            },
          },
          {
            label: t('messages.delete'),
      hint: t('messages.deleteHint'),
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            ),
            onClick: () => deleteMutation.mutate(),
            danger: true,
          },
        ]
      : []),
  ];

  return (
    <>
      <div
        data-message-id={message.id}
        className={clsx(
          'flex gap-2 group animate-message-in',
          isOwn ? 'justify-end' : 'justify-start',
        )}
        onContextMenu={handleContextMenu}
      >
        {!isOwn && !isPrivate && (
          <div className="w-8 h-8 flex-shrink-0">
            {showAvatar && message.sender && (
              <button
                onClick={() => navigate(`/u/${message.sender.id}`)}
                className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-transparent hover:ring-fg-accent transition-all"
                aria-label={message.sender.firstName}
              >
                <Avatar
                  name={`${message.sender.firstName} ${message.sender.lastName || ''}`}
                  avatarUrl={message.sender.avatarUrl}
                  size="sm"
                />
              </button>
            )}
          </div>
        )}
        <div
          className={clsx(
            'bubble max-w-[72%] min-w-0 px-4 py-2.5 text-[15px] leading-relaxed break-words',
            isOwn ? 'bubble-out bg-bg-bubbleOut' : 'bubble-in bg-bg-bubbleIn',
            isLastInGroup ? 'bubble-tail' : 'bubble-group-cont',
            'transition-transform duration-150 ease-spring hover:scale-[1.012]',
          )}
        >
          {!isOwn && !isPrivate && showAvatar && message.sender && (
            <button
              onClick={() => navigate(`/u/${message.sender.id}`)}
              className="text-xs font-medium text-fg-accent mb-0.5 hover:underline text-left"
            >
              {message.sender.firstName} {message.sender.lastName || ''}
            </button>
          )}

          {message.isDeleted ? (
            <div className="text-sm text-fg-tertiary italic">{t('messages.deletedToast')}</div>
          ) : isEditing ? (
            <div className="space-y-2 min-w-[220px]">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                autoFocus
                rows={2}
                className="w-full resize-none bg-bg-app border border-border rounded-lg px-2 py-1 text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-fg-accent"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2 py-1 text-xs text-fg-secondary hover:bg-bg-hover rounded transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={saveEdit}
                  disabled={!editValue.trim() || editMutation.isPending}
                  className="px-2 py-1 text-xs text-fg-on-accent bg-fg-accent rounded disabled:opacity-50 transition-opacity"
                >
                  {editMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.replyTo && (
                <div className="mb-1 px-2 py-1 bg-bg-hover border-l-2 border-fg-accent rounded text-xs max-w-full">
                  <div className="font-medium text-fg-accent truncate">
                    {message.replyTo.sender?.firstName || t('common.unknown')}
                  </div>
                  <div className="text-fg-secondary truncate">
                    {message.replyTo.content || t('chats.attachment')}
                  </div>
                </div>
              )}
              {message.media && (
                <div className="mb-1">
                  <MessageAttachment media={message.media} />
                </div>
              )}
              {(message as any).poll && (
                <PollCard chatId={chatId} messageId={message.id} poll={(message as any).poll} canClose={isOwn || canPin} />
              )}
              {(message as any).location && (
                <LocationCard chatId={chatId} messageId={message.id} location={(message as any).location} isOwn={isOwn} />
              )}
              {(message as any).sticker && (
                <div className="w-32 h-32">
                  <StickerImage src={(message as any).sticker.url} alt={(message as any).sticker.emoji} mimeType={(message as any).sticker.mimeType} />
                </div>
              )}
              {message.content && !(message as any).poll && !(message as any).sticker && !(message as any).location && (
                <div className={isEmojiOnly(decryptedContent ?? message.content) ? 'text-5xl leading-tight animate-pop-in' : 'text-sm text-fg-primary whitespace-pre-wrap break-words'}>
                  <RichText
                    content={decryptedContent ?? botCard?.text ?? message.content}
                    entities={isSecret ? null : message.entities}
                    plain={isPlaceholder(decryptedContent)}
                  />
                  {botCard && <BotKeyboard messageId={message.id} card={botCard} />}
                  {translation && <div className="mt-1 pt-1 border-t border-border-subtle text-fg-secondary">{translation}</div>}
                  {!isSecret && firstUrl(message.content) && <LinkPreviewCard url={firstUrl(message.content)!} />}
                </div>
              )}
            </>
          )}

          {translation && message.type === 'VOICE' && (
            <div className="mt-1 pt-1 border-t border-border-subtle text-sm text-fg-secondary">{translation}</div>
          )}

          {commentsOn && getChatType(chatId) === 'CHANNEL' && message.type !== 'SYSTEM' && (
            <CommentsButton chatId={chatId} messageId={message.id} count={(message as any).commentsCount ?? 0} canModerate={canPin} />
          )}
          {message.reactions && message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(
                message.reactions.reduce((acc: any, r: any) => {
                  acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                  return acc;
                }, {}),
              ).map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => reactMutation.mutate(emoji)}
                  className="px-1.5 py-0.5 bg-bg-hover rounded-full text-xs hover:bg-bg-active hover:scale-110 active:scale-95 transition-all duration-150 animate-pop-in"
                >
                  {emoji} {count as number}
                </button>
              ))}
            </div>
          )}

          <div
            className={clsx(
              'text-2xs mt-1 flex items-center gap-1 justify-end',
              isOwn ? 'text-fg-secondary' : 'text-fg-tertiary',
            )}
          >
            {message.isEdited && <span>{t('chats.edited')}</span>}
            <span>{formatTime(new Date(message.createdAt), locale)}</span>
            {isOwn && (
              <MessageStatusIcon
                status={message.status}
                className="ml-0.5 transition-transform duration-200 ease-spring"
              />
            )}
          </div>

          <button
            onClick={handleReactionClick}
            className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-bg-panel border border-border rounded-full flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 ease-spring hover:bg-bg-hover hover:shadow-dropdown animate-fade-in"
            aria-label={t('messages.addReaction')}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
        </div>
      </div>

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {reactionPicker && (
        <ReactionPicker
          x={reactionPicker.x}
          y={reactionPicker.y}
          onSelect={(emoji) => reactMutation.mutate(emoji)}
          onClose={() => setReactionPicker(null)}
        />
      )}
    </>
  );
}
