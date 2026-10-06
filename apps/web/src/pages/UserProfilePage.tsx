import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useI18n } from '../hooks/useI18n';
import { useAuthStore } from '../stores/auth.store';
import { usePresenceStore } from '../stores/presence.store';
import { formatRelative } from '../lib/format';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ICON, ProfileCard, ProfileRow, ProfileSection, type MenuItem, type ProfileAction } from '../components/profile/ProfileCard';
import { MediaRows, countLabel } from '../features/chats/components/MediaRows';
import { downloadChatExport } from '../features/chats/components/ExportChat';
import { useStartCall } from '../features/calls/hooks/useStartCall';
import { useChatsStore } from '../stores/chats.store';
import { Skeleton } from '../components/ui/Skeleton';

export interface PublicProfile {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  bio: string | null;
  statusEmoji?: string | null;
  avatarUrl: string | null;
  presence: string;
  lastSeenAt: string | null;
  isVerified: boolean;
  isSelf: boolean;
  isContact: boolean;
  contactId: string | null;
  isBlockedByMe: boolean;
  mutualContacts: number;
  sharedChats: { id: string; type: string; title: string | null }[];
}

const CHAT_TYPE_LABEL: Record<string, string> = {
  GROUP: 'chats.group',
  CHANNEL: 'chats.channel',
  PRIVATE: 'chats.personalChat',
};

/**
 * Read-only profile of a person.
 *
 * Every viewer-relative fact (contact / blocked / mutual / shared chats) comes
 * from a single `GET /users/:id/public` call, so the screen always knows which
 * action to offer instead of guessing from partial data.
 */
export function UserProfilePage({ embeddedUserId, onClose }: { embeddedUserId?: string; onClose?: () => void } = {}) {
  const params = useParams();
  const userId = embeddedUserId ?? params.userId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { user: me } = useAuthStore();
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => api.get<PublicProfile>(`/users/${userId}/public`),
    enabled: Boolean(userId),
  });

  // Creating a private chat is idempotent server-side, so this is safe even
  // when a dialog with that person already exists.
  const startChat = useMutation({
    mutationFn: () => api.post<{ id: string }>('/chats/private', { targetUserId: userId }),
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      onClose?.();
      navigate(`/chats/${chat.id}`);
    },
    onError: () => toast.error(t('profile.actionFailed')),
  });

  const addContact = useMutation({
    mutationFn: () => api.post('/contacts', { targetUsername: profile!.username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(t('profile.contactAdded'));
    },
    onError: () => toast.error(t('profile.actionFailed')),
  });

  const removeContact = useMutation({
    mutationFn: () => api.delete(`/contacts/${profile!.contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(t('profile.contactRemoved'));
    },
    onError: () => toast.error(t('profile.actionFailed')),
  });

  const setBlocked = useMutation({
    mutationFn: (blocked: boolean) =>
      blocked ? api.post(`/users/${userId}/block`) : api.delete(`/users/${userId}/block`),
    onSuccess: (_data, blocked) => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(blocked ? t('profile.blockedToast') : t('profile.unblockedToast'));
    },
    onError: () => toast.error(t('profile.actionFailed')),
  });

  if (isLoading) return <ProfileSkeleton />;

  if (isError || !profile) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4 sm:p-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
        <p className="mt-6 text-center text-fg-secondary">{t('profile.notFound')}</p>
      </div>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName || ''}`.trim();
  const isOnline = profile.presence === 'ONLINE' || onlineUsers.has(profile.id);
  const isSelf = profile.isSelf || profile.id === me?.id;
  const isBusy =
    startChat.isPending || addContact.isPending || removeContact.isPending || setBlocked.isPending;

  return (
    <ProfileView
      profile={profile}
      fullName={fullName}
      isOnline={isOnline}
      isSelf={isSelf}
      isBusy={isBusy}
      onBack={() => (onClose ? onClose() : navigate(-1))}
      onEdit={() => navigate('/settings/profile')}
      onSend={() => startChat.mutate()}
      onAddContact={() => addContact.mutate()}
      onRemoveContact={() => removeContact.mutate()}
      onToggleBlock={() => setBlocked.mutate(!profile.isBlockedByMe)}
      onOpenChat={(id) => navigate(`/chats/${id}`)}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="flex flex-col items-center gap-3 py-6">
        <Skeleton className="w-28 h-28 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

interface ProfileViewProps {
  profile: PublicProfile;
  fullName: string;
  isOnline: boolean;
  isSelf: boolean;
  isBusy: boolean;
  onBack: () => void;
  onEdit: () => void;
  onSend: () => void;
  onAddContact: () => void;
  onRemoveContact: () => void;
  onToggleBlock: () => void;
  onOpenChat: (id: string) => void;
}

function ProfileView({
  profile,
  fullName,
  isOnline,
  isSelf,
  isBusy,
  onBack,
  onEdit,
  onSend,
  onAddContact,
  onRemoveContact,
  onToggleBlock,
  onOpenChat,
}: ProfileViewProps) {
  const { t, locale } = useI18n();
  const privateChat = profile.sharedChats.find((c) => c.type === 'PRIVATE');
  const groups = profile.sharedChats.filter((c) => c.type === 'GROUP' || c.type === 'CHANNEL');
  const [showGroups, setShowGroups] = useState(false);
  const queryClient = useQueryClient();
  const { start: startCall, isCalling } = useStartCall();
  const dialog = useChatsStore((s) => s.chats.find((c) => c.id === privateChat?.id));
  const myId = useAuthStore((s) => s.user?.id);
  const muted = Boolean((dialog?.members as { userId: string; isMuted?: boolean }[] | undefined)?.find((m) => m.userId === myId)?.isMuted);
  const toggleMute = useMutation({
    mutationFn: () => api.patch(`/chats/${privateChat!.id}/mute`, { isMuted: !muted }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chats'] }),
  });

  const status = isOnline
    ? t('profile.online')
    : profile.lastSeenAt
      ? t('profile.lastSeen', { value: formatRelative(new Date(profile.lastSeenAt), locale) })
      : t('profile.lastSeenRecently');

  const shareContact = () => {
    const text = profile.username ? `@${profile.username}` : `${window.location.origin}/u/${profile.id}`;
    void navigator.clipboard?.writeText(text).then(() => toast.success(t('profile.copied')));
  };
  const editContact = () => {
    if (!profile.contactId) return;
    const nickname = window.prompt(t('profile.nicknamePrompt'), '');
    if (nickname === null) return;
    void api
      .patch(`/contacts/${profile.contactId}`, { nickname: nickname.trim() })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        toast.success(t('chatInfo.saved'));
      })
      .catch(() => toast.error(t('profile.actionFailed')));
  };
  const menu: MenuItem[] = [
    { label: t('profile.shareContact'), path: ICON.share, onClick: shareContact },
    ...(profile.isContact ? [{ label: t('profile.editContact'), path: ICON.pencil, onClick: editContact }] : []),
    ...(privateChat ? [{ label: t('chatInfo.export'), path: ICON.download, onClick: () => void downloadChatExport(privateChat.id, 'html', t('common.somethingWrong')) }] : []),
    { label: profile.isBlockedByMe ? t('profile.unblock') : t('profile.block'), path: ICON.block, onClick: onToggleBlock, danger: !profile.isBlockedByMe },
    ...(profile.isContact ? [{ label: t('profile.removeContact'), path: ICON.trash, onClick: onRemoveContact, danger: true }] : []),
  ];

  const actions: ProfileAction[] = isSelf
    ? [{ label: t('profile.editProfile'), path: ICON.pencil, onClick: onEdit }]
    : [
        { label: t('profile.chatAction'), path: ICON.chat, onClick: onSend, disabled: profile.isBlockedByMe || isBusy },
        {
          label: muted ? t('profile.soundOff') : t('profile.soundOn'),
          path: muted ? ICON.bellOff : ICON.bell,
          onClick: () => toggleMute.mutate(),
          disabled: !privateChat,
        },
        { label: t('profile.callAction'), path: ICON.phone, onClick: () => void startCall(profile.id, 'AUDIO'), disabled: profile.isBlockedByMe || isCalling },
        { label: t('profile.moreAction'), path: ICON.more, menu },
      ];

  return (
    <ProfileCard
      onClose={onBack}
      avatar={
        <Avatar
          name={fullName}
          avatarUrl={profile.avatarUrl}
          size="lg"
          circleClassName="w-24 h-24 text-3xl"
          presence={isOnline ? 'ONLINE' : 'OFFLINE'}
        />
      }
      title={
        <span className="inline-flex items-center justify-center gap-1.5">
          {fullName}
          {profile.statusEmoji ? <span data-testid="user-status">{profile.statusEmoji}</span> : null}
          {profile.isVerified && (
            <span className="text-fg-accent" title={t('profile.title')}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
                <path d="M12 2l2.2 2.1 3-.3.9 2.9 2.7 1.4-1.1 2.9 1.1 2.9-2.7 1.4-.9 2.9-3-.3L12 22l-2.2-2.1-3 .3-.9-2.9L3.2 15.9 4.3 13 3.2 10.1l2.7-1.4.9-2.9 3 .3z" />
                <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </span>
      }
      subtitle={status}
      actions={actions}
    >
      {(profile.username || profile.bio || (!isSelf && profile.mutualContacts > 0)) && (
        <ProfileSection>
          {profile.username && <ProfileRow path={ICON.at} label={`@${profile.username}`} caption={t('chatInfo.usernameLabel')} />}
          {profile.bio && <ProfileRow path={ICON.info} label={profile.bio} caption={t('chatInfo.bioLabel')} />}
          {!isSelf && profile.mutualContacts > 0 && (
            <ProfileRow path={ICON.users} label={t('profile.mutualContacts')} value={profile.mutualContacts} />
          )}
        </ProfileSection>
      )}

      {!isSelf && privateChat && <MediaRows chatId={privateChat.id} />}

      {!isSelf && privateChat && groups.length > 0 && (
        <ProfileSection>
          {groups.length > 0 && (
            <ProfileRow path={ICON.users} label={countLabel('groups', groups.length, locale)} onClick={() => setShowGroups((v) => !v)} />
          )}
          {showGroups &&
            groups.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onOpenChat(chat.id)}
                className="w-full flex items-center gap-3 pl-14 pr-5 py-2 text-left hover:bg-bg-hover transition-colors"
              >
                <Avatar name={chat.title || fullName} size="sm" isGroup={chat.type === 'GROUP'} isChannel={chat.type === 'CHANNEL'} />
                <span className="min-w-0">
                  <span className="block text-sm text-fg-primary truncate">{chat.title || fullName}</span>
                  <span className="block text-xs text-fg-secondary">{t(CHAT_TYPE_LABEL[chat.type] || 'chats.personalChat')}</span>
                </span>
              </button>
            ))}
        </ProfileSection>
      )}

      {!isSelf && !privateChat && groups.length > 0 && (
        <ProfileSection>
          <ProfileRow path={ICON.users} label={countLabel('groups', groups.length, locale)} onClick={() => setShowGroups((v) => !v)} />
          {showGroups &&
            groups.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onOpenChat(chat.id)}
                className="w-full flex items-center gap-3 pl-14 pr-5 py-2 text-left hover:bg-bg-hover transition-colors"
              >
                <Avatar name={chat.title || fullName} size="sm" isGroup={chat.type === 'GROUP'} isChannel={chat.type === 'CHANNEL'} />
                <span className="text-sm text-fg-primary truncate">{chat.title || fullName}</span>
              </button>
            ))}
        </ProfileSection>
      )}

      {!isSelf && (
        <ProfileSection>
          {profile.isBlockedByMe && <div className="px-5 py-2 text-sm text-fg-error">{t('profile.blockedNotice')}</div>}
          <ProfileRow path={ICON.share} label={t('profile.shareContact')} onClick={shareContact} />
          {profile.isContact ? (
            <>
              <ProfileRow path={ICON.pencil} label={t('profile.editContact')} onClick={editContact} />
              <ProfileRow path={ICON.trash} label={t('profile.removeContact')} onClick={isBusy ? undefined : onRemoveContact} />
            </>
          ) : (
            <ProfileRow path={ICON.userPlus} label={t('profile.addContact')} onClick={isBusy || !profile.username ? undefined : onAddContact} />
          )}
          <ProfileRow
            path={ICON.block}
            tone={profile.isBlockedByMe ? undefined : 'danger'}
            label={profile.isBlockedByMe ? t('profile.unblock') : t('profile.block')}
            onClick={isBusy ? undefined : onToggleBlock}
          />
        </ProfileSection>
      )}
    </ProfileCard>
  );
}
