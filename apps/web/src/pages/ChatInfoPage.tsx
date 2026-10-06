import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useI18n } from '../hooks/useI18n';
import { useAuthStore } from '../stores/auth.store';
import { useDebounce } from '../hooks/useDebounce';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ChatInfoBody } from './ChatInfoBody';
import { ChatProfileCard } from './ChatProfileCard';
import type { ChatDetails, SearchedUser } from './types';

const displayName = (u?: { firstName: string; lastName?: string | null } | null) =>
  u ? `${u.firstName} ${u.lastName || ''}`.trim() : '';

/**
 * Details and member management for a group or channel.
 *
 * A private dialog has almost nothing to show, so the peer profile is
 * surfaced instead of an empty "info" screen.
 */
export function ChatInfoPage({ embeddedChatId, onClose }: { embeddedChatId?: string; onClose?: () => void } = {}) {
  const params = useParams();
  const chatId = embeddedChatId ?? params.chatId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { user: me } = useAuthStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const debouncedMemberQuery = useDebounce(memberQuery, 300);

  const { data: chat, isLoading, isError } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => api.get<ChatDetails>(`/chats/${chatId}`),
    enabled: Boolean(chatId),
  });

  // Seed the edit form once per chat, so a background refetch never wipes
  // what the user is currently typing.
  useEffect(() => {
    if (!chat) return;
    setTitle(chat.title ?? '');
    setDescription(chat.description ?? '');
    // Seed only when the chat identity changes: a background refetch that
    // delivers a fresh object must not overwrite in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id]);

  const { data: candidates = [] } = useQuery({
    queryKey: ['chat-candidates', chatId, debouncedMemberQuery],
    queryFn: () =>
      api.get<SearchedUser[]>(
        `/search/users?q=${encodeURIComponent(debouncedMemberQuery)}&limit=20`,
      ),
    enabled: debouncedMemberQuery.trim().length >= 1,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    queryClient.invalidateQueries({ queryKey: ['chats'] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/chats/${chatId}`, {
        title: title.trim() || undefined,
        description: description.trim(),
      }),
    onSuccess: () => {
      invalidate();
      setIsEditing(false);
      toast.success(t('chatInfo.saved'));
    },
    onError: () => toast.error(t('chatInfo.saveFailed')),
  });

  const addMembers = useMutation({
    mutationFn: (userIds: string[]) => api.post(`/chats/${chatId}/members`, { userIds }),
    onSuccess: () => {
      invalidate();
      toast.success(t('chatInfo.allAdded'));
    },
    onError: () => toast.error(t('chatInfo.actionFailed')),
  });

  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/chats/${chatId}/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      toast.success(t('chatInfo.left'));
      navigate('/chats', { replace: true });
    },
    onError: () => toast.error(t('chatInfo.actionFailed')),
  });

  const setMuted = useMutation({
    mutationFn: (isMuted: boolean) => api.patch(`/chats/${chatId}/mute`, { isMuted }),
    onSuccess: invalidate,
    onError: () => toast.error(t('chatInfo.actionFailed')),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/chats/${chatId}/members/${userId}`),
    onSuccess: () => {
      invalidate();
      toast.success(t('chatInfo.memberRemoved'));
    },
    onError: () => toast.error(t('chatInfo.actionFailed')),
  });

  const setRole = useMutation({
    mutationFn: (userId: string) =>
      api.patch(`/chats/${chatId}/members/${userId}`, { role: 'ADMIN' }),
    onSuccess: () => {
      invalidate();
      toast.success(t('chatInfo.roleChanged'));
    },
    onError: () => toast.error(t('chatInfo.actionFailed')),
  });

  if (isLoading && onClose) return null;
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if ((isError || !chat) && onClose) return null;
  if (isError || !chat) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4 sm:p-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
        <p className="mt-6 text-center text-fg-secondary">{t('errors.notFound')}</p>
      </div>
    );
  }

  const myMember = chat.members.find((m) => m.userId === me?.id);
  const myRole = myMember?.role;
  const isManager = myRole === 'OWNER' || myRole === 'ADMIN';
  const isOwner = myRole === 'OWNER';
  const isPrivate = chat.type === 'PRIVATE';
  const peer = chat.members.find((m) => m.userId !== me?.id);
  const existingIds = new Set(chat.members.map((m) => m.userId));
  const addable = candidates.filter((c) => !existingIds.has(c.id));
  const chatTitle = chat.title || displayName(peer?.user) || t('chats.personalChat');

  if (onClose) {
    return (
      <ChatProfileCard
        onClose={onClose ?? (() => undefined)}
        chat={chat}
        chatTitle={chatTitle}
        isPrivate={isPrivate}
        isManager={isManager}
        isOwner={isOwner}
        isMuted={Boolean(myMember?.isMuted)}
        messageCount={chat._count?.messages ?? 0}
        createdAt={chat.createdAt}
        members={chat.members}
        addable={addable}
        isEditing={isEditing}
        title={title}
        description={description}
        memberQuery={memberQuery}
        isSaving={saveMutation.isPending}
        isAdding={addMembers.isPending}
        myId={me?.id ?? ''}
        onOpenProfile={(id) => navigate(`/u/${id}`)}
        onStartEdit={() => setIsEditing(true)}
        onCancelEdit={() => {
          setTitle(chat.title ?? '');
          setDescription(chat.description ?? '');
          setIsEditing(false);
        }}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onSave={() => saveMutation.mutate()}
        onMemberQueryChange={setMemberQuery}
        onAddMember={(id) => addMembers.mutate([id])}
        onRemoveMember={(id) => removeMember.mutate(id)}
        onPromote={(id) => setRole.mutate(id)}
        onToggleMute={(next) => setMuted.mutate(next)}
        onLeave={() => {
          if (window.confirm(t('chatInfo.leaveConfirm'))) leaveMutation.mutate();
        }}
        isLeaving={leaveMutation.isPending}
      />
    );
  }

  return (
    <div className={onClose ? 'flex-1 flex flex-col bg-bg-panel overflow-hidden animate-fade-in' : 'flex-1 flex flex-col bg-bg-app overflow-hidden animate-fade-in'}>
      <header className="flex items-center gap-3 px-5 py-3 border-b border-border-subtle bg-bg-panel shrink-0">
        {onClose ? (
          <>
            <h1 className="flex-1 text-[15px] font-semibold text-fg-primary">{t('chatInfo.title')}</h1>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1.5 rounded-lg text-fg-secondary hover:bg-bg-hover hover:text-fg-primary transition-colors"
              aria-label={t('common.close')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/chats/${chatId}`)} aria-label={t('common.back')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Button>
            <h1 className="text-lg font-semibold text-fg-primary">{t('chatInfo.title')}</h1>
          </>
        )}
      </header>
      <ChatInfoBody
        chat={chat}
        chatTitle={chatTitle}
        isPrivate={isPrivate}
        isManager={isManager}
        isOwner={isOwner}
        isMuted={Boolean(myMember?.isMuted)}
        messageCount={chat._count?.messages ?? 0}
        createdAt={chat.createdAt}
        members={chat.members}
        addable={addable}
        isEditing={isEditing}
        title={title}
        description={description}
        memberQuery={memberQuery}
        isSaving={saveMutation.isPending}
        isAdding={addMembers.isPending}
        myId={me?.id ?? ''}
        onOpenProfile={(id) => navigate(`/u/${id}`)}
        onStartEdit={() => setIsEditing(true)}
        onCancelEdit={() => {
          setTitle(chat.title ?? '');
          setDescription(chat.description ?? '');
          setIsEditing(false);
        }}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onSave={() => saveMutation.mutate()}
        onMemberQueryChange={setMemberQuery}
        onAddMember={(id) => addMembers.mutate([id])}
        onRemoveMember={(id) => removeMember.mutate(id)}
        onPromote={(id) => setRole.mutate(id)}
        onToggleMute={(next) => setMuted.mutate(next)}
        onLeave={() => {
          if (window.confirm(t('chatInfo.leaveConfirm'))) leaveMutation.mutate();
        }}
        isLeaving={leaveMutation.isPending}
      />
    </div>
  );
}
