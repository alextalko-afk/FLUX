import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useMessagesStore } from '../../stores/messages.store';
import { useChatsStore } from '../../stores/chats.store';
import { useAuthStore } from '../../stores/auth.store';
import { MessageListV2, START_INDEX } from '../messages/components/MessageListV2';
import type { VirtuosoHandle } from 'react-virtuoso';
import { MessageInput } from '../messages/MessageInput';
import { useMediaUpload } from '../media/hooks/useMediaUpload';
import { FileDropZone } from '../media/components/FileDropZone';
import { UploadProgress } from '../media/components/UploadProgress';
import { VoiceRecorder } from '../media/components/VoiceRecorder';
import { CallButton } from '../calls/components/CallButton';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { useI18n } from '../../hooks/useI18n';
import { formatRelative } from '../../lib/format';
import { Tooltip } from '../../components/ui/Tooltip';
import { realtime } from '../../lib/realtime';
import { SecretBanner } from './components/SecretBanner';
import { GroupE2eeBanner } from './components/GroupE2eeBanner';
import { useGroupE2ee } from './hooks/useGroupE2ee';
import { useSecretChat } from './hooks/useSecretChat';
import type { TextEntity } from '../../lib/richText';
import { PinnedBar } from './components/PinnedBar';
import { useCanPin } from './hooks/useCanPin';
import { GENERAL_TOPIC, TopicBar } from './components/TopicBar';
import { GroupCallBanner, GroupCallButton } from '../calls/components/GroupCallControls';
import { usePostBlock } from './hooks/useCanPost';
import { ChatInfoPage } from '../../pages/ChatInfoPage';
import { UserProfilePage } from '../../pages/UserProfilePage';

/** "online" / "last seen 5 minutes ago" for the chat header. */
function PresenceLabel({
  presence,
  lastSeenAt,
}: {
  presence?: string;
  lastSeenAt: string | null;
}) {
  const { t, locale } = useI18n();

  if (presence === 'ONLINE') return <>{t('profile.online')}</>;
  if (!lastSeenAt) return <>{t('profile.lastSeenRecently')}</>;

  return <>{t('profile.lastSeen', { value: formatRelative(new Date(lastSeenAt), locale) })}</>;
}

/** Stable empty list, so effects that depend on `messages` do not re-run for a chat with none. */
const NO_MESSAGES: any[] = [];

interface ChatViewProps {
  chat: any;
  /** Desktop: show the profile window over the chat instead of navigating to a page. */
  onOpenInfo?: (target: { userId?: string }) => void;
}

interface ReplyTarget {
  id: string;
  content: string;
  senderName: string;
}

function categoryToMessageType(category: string): string {
  switch (category) {
    case 'image':
      return 'IMAGE';
    case 'video':
      return 'VIDEO';
    case 'audio':
      return 'VOICE';
    default:
      return 'DOCUMENT';
  }
}

/**
 * `SendMessageDto.clientTempId` is validated with `@IsUUID()`, so this must
 * be a real UUID — `nanoid()` would make every send fail with 400.
 */
function newClientTempId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts: RFC4122 v4 layout.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function ChatViewMain({ chat, onOpenInfo }: ChatViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const { messagesByChat, setMessages, addMessage, setLoading, prependMessages, paging, setPaging } =
    useMessagesStore();
  const setUnreadCount = useChatsStore((state) => state.setUnreadCount);
  const allMessages = messagesByChat[chat.id] ?? NO_MESSAGES;
  const isForum = Boolean((chat as { isForum?: boolean }).isForum);
  const [topic, setTopic] = useState(GENERAL_TOPIC);
  const messages = useMemo(
    () => (isForum ? allMessages.filter((m: any) => (m.topicId ?? GENERAL_TOPIC) === topic) : allMessages),
    [allMessages, isForum, topic],
  );
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [missedCount, setMissedCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const listRef = useRef<VirtuosoHandle>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const messageCountRef = useRef(0);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const chatPaging = paging[chat.id];
  const { upload, isUploading, progress, cancel } = useMediaUpload();
  const [uploadingName, setUploadingName] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
    listRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior });
    setMissedCount(0);
  };

  const handleAtBottomChange = (atBottom: boolean) => {
    setIsAtBottom(atBottom);
    if (atBottom) setMissedCount(0);
  };

  // The list follows new messages by itself while the reader is at the bottom.
  // Here we only count what arrived while they were reading older messages, so
  // the "new messages" button can show it. Older pages prepended at the top
  // change the length but not the newest message, so they are not counted.
  useEffect(() => {
    const newest = messages[messages.length - 1]?.id ?? null;
    const added = messages.length - messageCountRef.current;
    const newestChanged = newest !== lastMessageIdRef.current;
    messageCountRef.current = messages.length;
    lastMessageIdRef.current = newest;

    if (newestChanged && added > 0 && !isAtBottom) {
      setMissedCount((previous) => previous + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // A different chat starts with a clean slate.
  useEffect(() => {
    messageCountRef.current = 0;
    lastMessageIdRef.current = null;
    setMissedCount(0);
    setIsAtBottom(true);
  }, [chat.id]);

  const loadOlder = async (): Promise<boolean> => {
    const cursor = useMessagesStore.getState().paging[chat.id]?.cursor;
    if (!cursor || isLoadingOlder) return false;

    setIsLoadingOlder(true);
    try {
      const result = await api.get<any>(`/chats/${chat.id}/messages?limit=50&cursor=${cursor}`);
      const older = [...result.items].reverse();
      prependMessages(chat.id, older);

      const current = useMessagesStore.getState().paging[chat.id];
      setPaging(chat.id, {
        cursor: result.nextCursor,
        prepended: (current?.prepended ?? 0) + older.length,
      });
      return older.length > 0;
    } catch {
      toast.error(t('common.somethingWrong'));
      return false;
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const showScrollDown = !isAtBottom;

  const { isLoading: isLoadingHistory } = useQuery({
    queryKey: ['messages', chat.id],
    queryFn: async () => {
      setLoading(chat.id, true);
      const result = await api.get<any>(`/chats/${chat.id}/messages?limit=50`);
      const newest = [...result.items].reverse();

      // A refetch must not throw away older pages the reader already loaded.
      const loaded = useMessagesStore.getState().messagesByChat[chat.id] ?? [];
      const oldestNewest = newest[0]?.createdAt;
      const older = oldestNewest
        ? loaded.filter((message: any) => message.createdAt < oldestNewest)
        : [];
      setMessages(chat.id, [...older, ...newest]);

      // The cursor only needs resetting the first time; later refetches keep the
      // position reached by scrolling back.
      if (!useMessagesStore.getState().paging[chat.id]) {
        setPaging(chat.id, { cursor: result.nextCursor, prepended: 0 });
      }
      setLoading(chat.id, false);
      return result;
    },
  });

  // Secret chats: keys are loaded from this device; nothing is sent to the server but ciphertext.
  const isSecret = chat.type === 'SECRET';
  const secret = useSecretChat(chat.id, isSecret);
  const isE2eeGroup = Boolean((chat as { e2ee?: boolean }).e2ee);
  const groupE2ee = useGroupE2ee(chat.id, isE2eeGroup);
  const isEncrypted = isSecret || isE2eeGroup;

  const canPin = useCanPin(chat.id);
  const postBlock = usePostBlock(chat.id);

  // Tell the server what has been read, so the counter is the same on every
  // device. Only while the conversation is actually on screen and scrolled to
  // the newest message.
  const [isTabVisible, setIsTabVisible] = useState(() => document.visibilityState === 'visible');
  const lastReadSentRef = useRef<string | null>(null);

  useEffect(() => {
    const onVisibility = () => setIsTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, []);

  useEffect(() => {
    lastReadSentRef.current = null;
  }, [chat.id]);

  useEffect(() => {
    if (!isTabVisible || !isAtBottom || !chat.unreadCount) return;

    const newest = [...messages].reverse().find((m: any) => m.senderId !== user?.id);
    if (!newest || lastReadSentRef.current === newest.id) return;

    lastReadSentRef.current = newest.id;
    api
      .post<{ unreadCount: number }>(`/chats/${chat.id}/messages/read`, {
        upToMessageId: newest.id,
      })
      .then((result) => setUnreadCount(chat.id, result.unreadCount))
      .catch(() => {
        // Try again on the next change instead of leaving the counter stuck.
        lastReadSentRef.current = null;
      });
  }, [messages, isAtBottom, isTabVisible, chat.id, chat.unreadCount, user?.id, setUnreadCount]);

  /**
   * Scrolls to a message and flashes it. If it is older than what is loaded,
   * older pages are fetched until it turns up (bounded, so a bad id cannot
   * walk the whole history).
   */
  const jumpToMessage = async (messageId: string): Promise<boolean> => {
    const indexOf = () =>
      (useMessagesStore.getState().messagesByChat[chat.id] ?? []).findIndex(
        (message: any) => message.id === messageId,
      );

    let index = indexOf();
    for (let pages = 0; index < 0 && pages < 20; pages++) {
      if (!(await loadOlder())) break;
      index = indexOf();
    }
    if (index < 0) return false;

    listRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' });
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      if (!target) return;
      target.classList.add('message-flash');
      window.setTimeout(() => target.classList.remove('message-flash'), 1600);
    }, 450);
    return true;
  };

  // A link such as /chats/<id>?msg=<messageId> (from a profile's media list) opens the chat at that message.
  const [searchParams, setSearchParams] = useSearchParams();
  const targetMessageId = searchParams.get('msg');
  useEffect(() => {
    if (!targetMessageId || isLoadingHistory) return;
    let cancelled = false;
    void jumpToMessage(targetMessageId).then(() => {
      if (cancelled) return;
      const next = new URLSearchParams(searchParams);
      next.delete('msg');
      setSearchParams(next, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [targetMessageId, isLoadingHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMutation = useMutation({
    mutationFn: async ({ content, entities }: { content: string; entities?: TextEntity[] }) => {
      const clientTempId = newClientTempId();
      const replyToMessageId = replyTo?.id;
      const optimisticMessage = {
        id: clientTempId,
        chatId: chat.id,
        senderId: user!.id,
        type: 'TEXT',
        content,
        entities,
        topicId: isForum && topic !== GENERAL_TOPIC ? topic : null,
        createdAt: new Date().toISOString(),
        status: 'SENDING',
        isEdited: false,
        isDeleted: false,
        sender: {
          id: user!.id,
          firstName: user!.firstName,
          lastName: user!.lastName,
          avatarUrl: user!.avatarUrl,
        },
        replyTo: replyTo
          ? {
              id: replyTo.id,
              content: replyTo.content,
              sender: { firstName: replyTo.senderName },
            }
          : undefined,
      };
      addMessage(chat.id, optimisticMessage);
      setReplyTo(null);
      // Your own message is always shown, even if you were reading older ones.
      window.requestAnimationFrame(() => scrollToBottom('smooth'));

      try {
        const result = await api.post<any>(`/chats/${chat.id}/messages`, {
          type: 'TEXT',
          content,
          entities,
          clientTempId,
          replyToMessageId,
          ...(isForum && topic !== GENERAL_TOPIC ? { topicId: topic } : {}),
        });
        useMessagesStore.getState().updateMessage(chat.id, clientTempId, {
          ...result,
          status: 'SENT',
        });
        queryClient.invalidateQueries({ queryKey: ['chats'] });
      } catch (err) {
        useMessagesStore.getState().updateMessage(chat.id, clientTempId, {
          status: 'FAILED',
        });
        const code = (err as { code?: string })?.code;
        toast.error(
          code === 'SLOW_MODE'
            ? t('messages.slowModeWait', { seconds: String((err as { retryAfter?: number }).retryAfter ?? '') })
            : code === 'CHANNEL_READ_ONLY'
              ? t('messages.channelReadOnly')
              : code === 'MEMBER_RESTRICTED'
                ? t('messages.memberRestricted')
                : t('messages.sendFailed'),
        );
      }
    },
  });

  const handleFile = async (file: File) => {
    setUploadingName(file.name);
    try {
      const uploaded = await upload(file, chat.id);
      await api.post<any>(`/chats/${chat.id}/messages`, {
        type: categoryToMessageType(uploaded.category),
        content: '',
        mediaId: uploaded.fileObjectId,
        clientTempId: newClientTempId(),
        replyToMessageId: replyTo?.id,
      });
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['messages', chat.id] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    } catch (err) {
      toast.error(t('messages.attachmentFailed'));
    } finally {
      setUploadingName('');
    }
  };

  // Drag & drop sends files one at a time so the single upload/progress state
  // owned by `useMediaUpload` is never clobbered by parallel uploads.
  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      await handleFile(file);
    }
  };

  // The recorder has already uploaded the clip by the time it calls back, so
  // only the `VOICE` message itself is created here. `duration` (seconds) and
  // the normalised `waveform` samples are persisted on `MessageMedia`.
  const handleVoiceSend = async (
    fileObjectId: string,
    duration: number,
    waveform: number[],
  ) => {
    setIsRecording(false);
    try {
      await api.post<any>(`/chats/${chat.id}/messages`, {
        type: 'VOICE',
        content: '',
        mediaId: fileObjectId,
        duration,
        waveform,
        clientTempId: newClientTempId(),
        replyToMessageId: replyTo?.id,
      });
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['messages', chat.id] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    } catch {
      toast.error(t('messages.voiceFailed'));
    }
  };

  const handleSend = (content: string, entities?: TextEntity[]) => {
    if (!content.trim()) return;
    sendMutation.mutate({ content, entities });
  };

  const handleReply = (message: any) => {
    const senderName =
      `${message.sender?.firstName || ''} ${message.sender?.lastName || ''}`.trim() ||
      (message.senderId === user?.id ? 'yourself' : 'user');
    setReplyTo({
      id: message.id,
      content: message.content || '',
      senderName,
    });
  };

  // Live "is typing" roster for this chat, keyed by user id. Entries expire on
  // their own so a lost `stop` frame cannot leave the indicator stuck.
  useEffect(() => {
    const timers = new Map<string, number>();

    const remove = (typingUserId: string) => {
      setTypingUsers((prev) => {
        if (!(typingUserId in prev)) return prev;
        const next = { ...prev };
        delete next[typingUserId];
        return next;
      });
    };

    const handleStart = (payload: any) => {
      if (payload?.chatId !== chat.id || payload?.userId === user?.id) return;
      const typingUserId = payload.userId as string;
      setTypingUsers((prev) => ({ ...prev, [typingUserId]: Date.now() }));
      const existing = timers.get(typingUserId);
      if (existing) window.clearTimeout(existing);
      timers.set(
        typingUserId,
        window.setTimeout(() => {
          timers.delete(typingUserId);
          remove(typingUserId);
        }, 5000),
      );
    };

    const handleStop = (payload: any) => {
      if (payload?.chatId !== chat.id || !payload?.userId) return;
      const typingUserId = payload.userId as string;
      const existing = timers.get(typingUserId);
      if (existing) {
        window.clearTimeout(existing);
        timers.delete(typingUserId);
      }
      remove(typingUserId);
    };

    const offStart = realtime.on('chat.typing.start', handleStart);
    const offStop = realtime.on('chat.typing.stop', handleStop);

    return () => {
      offStart();
      offStop();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [chat.id, user?.id]);

  const title =
    chat.title ||
    chat.members
      ?.filter((m: any) => m.userId !== user?.id)
      .map((m: any) => `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim())
      .filter(Boolean)
      .join(', ') ||
    t('search.chatFallback');

  const typingIds = Object.keys(typingUsers);
  const typingName = typingIds
    .map((id) => {
      const member = chat.members?.find((m: any) => m.userId === id);
      return member?.user?.firstName || t('chats.someone');
    })
    .join(', ');

  // Calls are one-to-one only — `POST /calls/initiate` takes a single target.
  const peer = chat.type === 'PRIVATE'
    ? chat.members?.find((m: any) => m.userId !== user?.id)
    : undefined;
  const peerId: string | undefined = peer?.userId;
  const peerPresence: string | undefined = peer?.user?.presence ?? undefined;
  const peerLastSeen: string | null = peer?.user?.lastSeenAt ?? null;
  const callTargetId = peerId;

  // Private dialogs lead to the person, groups/channels to the member list.
  const openProfileId = chat.type === 'GROUP' || chat.type === 'CHANNEL' ? undefined : peerId;
  const openDetails = () => {
    if (onOpenInfo) onOpenInfo({ userId: openProfileId });
    else if (openProfileId) navigate(`/u/${openProfileId}`);
    else navigate(`/chats/${chat.id}/info`);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle bg-bg-panel/70 backdrop-blur-xl backdrop-saturate-150 sticky top-0 z-20">
        <button
          className="md:hidden p-2 -ml-2 rounded-lg hover:bg-bg-hover"
          onClick={() => navigate('/chats')}
          aria-label={t('common.back')}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          onClick={openDetails}
          className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-xl px-2 py-1 -mx-2 transition-colors hover:bg-bg-hover"
          aria-label={openProfileId ? title : t('chatInfo.title')}
        >
          <Avatar
            name={title}
            avatarUrl={chat.avatarUrl}
            size="md"
            isGroup={chat.type === 'GROUP'}
            isChannel={chat.type === 'CHANNEL'}
            presence={peerPresence ?? undefined}
          />
          <div className="min-w-0">
            <div className="text-[16px] leading-5 font-semibold text-fg-primary truncate">{title}</div>
            <div className="text-[13px] leading-4 text-fg-secondary truncate">
              {typingIds.length > 0 ? (
                <span className="text-fg-accent">
                  {typingIds.length === 1
                    ? t('chats.userTyping', { name: typingName })
                    : t('chats.typing')}
                </span>
              ) : peerId ? (
                <PresenceLabel presence={peerPresence} lastSeenAt={peerLastSeen} />
              ) : (
                t('chats.members', { count: chat.members?.length || 0 })
              )}
            </div>
          </div>
        </button>
        {peerId && (
          <Tooltip label={t('chatInfo.title')} side="bottom">
            <Button
              size="sm"
              variant="ghost"
              onClick={openDetails}
              aria-label={t('chatInfo.title')}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </Button>
          </Tooltip>
        )}
        <GroupCallButton chatId={chat.id} chatType={chat.type} />
        {callTargetId ? (
          <Tooltip label={t('calls.audioCall')} side="bottom">
            <CallButton targetUserId={callTargetId} type="AUDIO" />
          </Tooltip>
        ) : (
          <Tooltip label={t('chats.callUnavailable')} side="bottom">
            <Button size="sm" variant="ghost" disabled aria-label={t('chats.callUnavailable')}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </Button>
          </Tooltip>
        )}
      </header>

      <GroupCallBanner chatId={chat.id} />
      {isForum && <TopicBar chatId={chat.id} active={topic} onChange={setTopic} canManage={canPin} />}
      {isE2eeGroup && <GroupE2eeBanner status={groupE2ee} />}
      {isSecret ? <SecretBanner state={secret} /> : <PinnedBar chatId={chat.id} canManage={canPin} onJump={jumpToMessage} />}

      <FileDropZone
        className="flex-1 min-h-0"
        onFiles={(files) => void handleFiles(files)}
        label={t('messages.dropFilesHere')}
      >
        <div className="h-full">
          {isLoadingHistory ? (
            <div className="space-y-3 max-w-md mx-auto pt-4 px-4" aria-label={t('common.loading')}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`h-10 rounded-bubble skeleton ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`}
                  />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-fg-secondary py-8 animate-float-up">
              {t('chats.noMessagesStart')}
            </div>
          ) : (
            <MessageListV2
              messages={messages}
              currentUserId={user?.id || ''}
              chatId={chat.id}
              onReply={handleReply}
              firstItemIndex={START_INDEX - (chatPaging?.prepended ?? 0)}
              hasMoreOlder={Boolean(chatPaging?.cursor)}
              isLoadingOlder={isLoadingOlder}
              onLoadOlder={() => void loadOlder()}
              onAtBottomChange={handleAtBottomChange}
              listRef={listRef}
            />
          )}
        </div>

        {showScrollDown && (
          <Tooltip label={t('chats.newMessages')} side="left">
            <button
              onClick={() => scrollToBottom()}
              className="absolute bottom-4 right-4 flex items-center gap-1.5 pl-2.5 pr-3 py-2 rounded-full bg-bg-panel border border-border shadow-dropdown text-fg-secondary hover:text-fg-primary hover:border-fg-accent/50 transition-all duration-200 ease-spring hover:-translate-y-0.5 animate-pop-in"
              aria-label={t('chats.newMessages')}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {missedCount > 0 && (
                <span className="text-xs font-semibold text-fg-accent">{missedCount}</span>
              )}
            </button>
          </Tooltip>
        )}
      </FileDropZone>

      {isUploading && (
        <div className="px-4 pb-2">
          <UploadProgress
            fileName={uploadingName}
            percent={progress?.percent ?? 0}
            onCancel={cancel}
          />
        </div>
      )}

      {isRecording ? (
        <VoiceRecorder
          chatId={chat.id}
          onSend={(fileObjectId, duration, waveform) =>
            void handleVoiceSend(fileObjectId, duration, waveform)
          }
          onCancel={() => setIsRecording(false)}
        />
      ) : postBlock ? (
        <div className="border-t border-border-subtle bg-bg-panel/70 p-4 text-center text-sm text-fg-secondary">
          {postBlock === 'channel' ? t('messages.channelReadOnly') : t('messages.memberRestricted')}
        </div>
      ) : (
        <MessageInput
          chatId={chat.id}
          onSend={handleSend}
          onFile={isEncrypted ? undefined : handleFile}
          onVoice={isEncrypted ? undefined : () => setIsRecording(true)}
          secretStatus={isSecret ? secret.status : isE2eeGroup ? groupE2ee : undefined}
          onTyping={(isTyping) => realtime.send('chat.typing', { chatId: chat.id, isTyping })}
          isLoading={sendMutation.isPending}
          isUploading={isUploading}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      )}
    </div>
  );
}

/** The chat plus, on desktop, an optional information panel on its right. */
export function ChatView({ chat }: { chat: any }) {
  const [target, setTarget] = useState<{ userId?: string } | null>(null);
  const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

  // A different chat starts with the panel closed.
  useEffect(() => {
    setTarget(null);
  }, [chat.id]);

  // Jumping to a message from a profile closes the profile window first.
  useEffect(() => {
    const close = () => setTarget(null);
    window.addEventListener('flux:close-profile', close);
    return () => window.removeEventListener('flux:close-profile', close);
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex-1 min-w-0 h-full">
        <ChatViewMain chat={chat} onOpenInfo={isDesktop ? setTarget : undefined} />
      </div>
      {target && isDesktop &&
        (target.userId ? (
          <UserProfilePage embeddedUserId={target.userId} onClose={() => setTarget(null)} />
        ) : (
          <ChatInfoPage embeddedChatId={chat.id} onClose={() => setTarget(null)} />
        ))}
    </div>
  );
}
