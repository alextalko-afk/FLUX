import { useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ICON, Icon, ProfileCard, ProfileRow, ProfileSection } from '../components/profile/ProfileCard';
import { useI18n } from '../hooks/useI18n';
import { MediaRows } from '../features/chats/components/MediaRows';
import { ExportChat, downloadChatExport } from '../features/chats/components/ExportChat';
import { JoinRequestsSection } from '../features/chats/components/JoinRequestsSection';
import { AdminLogSection } from '../features/chats/components/AdminLogSection';
import { CommentsToggle, StatsSection } from '../features/chats/components/ChannelSettings';
import { ForumSection } from '../features/chats/components/ForumSection';
import { SlowModeSection } from '../features/chats/components/SlowModeSection';
import { InviteLinkSection } from '../features/chats/components/InviteLinkSection';
import { MemberRow, displayName, type ChatInfoBodyProps } from './ChatInfoBody';

const TYPE_LABEL: Record<string, string> = {
  PRIVATE: 'chats.personalChat',
  GROUP: 'chats.group',
  CHANNEL: 'chats.channel',
  SAVED: 'chats.personalChat',
};

/** The profile window of a group or channel: header, facts, shared media, members, management. */
export function ChatProfileCard(props: ChatInfoBodyProps & { onClose: () => void }) {
  const {
    chat, chatTitle, isPrivate, isManager, isOwner, isMuted, members, addable, isEditing, title, description, memberQuery,
    isSaving, isAdding, myId, isLeaving, onClose, onOpenProfile, onStartEdit, onCancelEdit, onTitleChange, onDescriptionChange,
    onSave, onMemberQueryChange, onAddMember, onRemoveMember, onPromote, onToggleMute, onLeave,
  } = props;
  const { t } = useI18n();
  const [showMore, setShowMore] = useState(false);
  const online = members.filter((m) => m.user.presence === 'ONLINE').length;
  const e2ee = Boolean((chat as { e2ee?: boolean }).e2ee);

  return (
    <ProfileCard
      onClose={onClose}
      avatar={
        <Avatar
          name={chatTitle}
          avatarUrl={chat.avatarUrl}
          size="lg"
          circleClassName="w-20 h-20 text-2xl"
          isGroup={chat.type === 'GROUP'}
          isChannel={chat.type === 'CHANNEL'}
        />
      }
      title={chatTitle}
      subtitle={
        isPrivate
          ? t(TYPE_LABEL[chat.type] || 'chats.personalChat')
          : `${t(TYPE_LABEL[chat.type] || 'chats.group')} · ${members.length} (${online} ${t('profile.online')})`
      }
      actions={
        isPrivate
          ? []
          : [
              {
                label: isMuted ? t('profile.soundOff') : t('profile.soundOn'),
                path: isMuted ? ICON.bellOff : ICON.bell,
                onClick: () => onToggleMute(!isMuted),
              },
              {
                label: t('profile.moreAction'),
                path: ICON.more,
                menu: [
                  { label: t('chatInfo.export'), path: ICON.download, onClick: () => void downloadChatExport(chat.id, 'html', t('common.somethingWrong')) },
                  { label: t('chatInfo.leave'), path: ICON.logout, onClick: onLeave, danger: true },
                ],
              },
            ]
      }
    >
      {!isPrivate && (
        <ProfileSection>
          {isEditing ? (
            <div className="px-5 py-3 space-y-3">
              <Input label={t('chats.title')} value={title} onChange={(e) => onTitleChange(e.target.value)} />
              <Input
                label={t('chatInfo.description')}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder={t('chats.descriptionPlaceholder')}
              />
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={onCancelEdit}>
                  {t('common.cancel')}
                </Button>
                <Button className="flex-1" isLoading={isSaving} onClick={onSave}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          ) : (
            <ProfileRow
              path={ICON.info}
              label={chat.description || t('chatInfo.noDescription')}
              caption={t('chatInfo.description')}
              action={isManager ? { text: t('common.edit'), onClick: onStartEdit } : undefined}
            />
          )}
          {e2ee && <ProfileRow path={ICON.lock} tone="success" label={t('chats.e2eeBadge')} caption={t('chats.e2eeGroupReady')} />}
        </ProfileSection>
      )}

      <MediaRows chatId={chat.id} />

      {!isPrivate && (
        <ProfileSection title={`${t('chatInfo.members')} · ${members.length}`}>
          {isManager && (
            <div className="px-5 pb-1">
              <Input value={memberQuery} onChange={(e) => onMemberQueryChange(e.target.value)} placeholder={t('chatInfo.searchPeople')} />
              {addable.length > 0 && (
                <div className="mt-1 max-h-48 overflow-y-auto">
                  {addable.map((candidate) => (
                    <button
                      key={candidate.id}
                      disabled={isAdding}
                      onClick={() => onAddMember(candidate.id)}
                      className="w-full flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-bg-hover text-left disabled:opacity-50"
                    >
                      <Avatar name={displayName(candidate)} avatarUrl={candidate.avatarUrl} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-fg-primary truncate">{displayName(candidate)}</span>
                        {candidate.username && <span className="block text-xs text-fg-secondary truncate">@{candidate.username}</span>}
                      </span>
                      <span className="text-fg-accent text-xs font-medium">{t('common.add')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="px-2">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                canManage={isManager && member.userId !== myId}
                canPromote={isOwner && member.role !== 'OWNER'}
                onOpen={() => onOpenProfile(member.userId)}
                onRemove={() => onRemoveMember(member.userId)}
                onPromote={() => onPromote(member.userId)}
              />
            ))}
          </div>
        </ProfileSection>
      )}

      <ProfileSection>
        <button
          onClick={() => setShowMore((open) => !open)}
          aria-expanded={showMore}
          className="w-full flex items-center gap-5 px-5 py-2.5 text-[14.5px] text-fg-primary hover:bg-bg-hover transition-colors"
        >
          <span className="text-fg-secondary">
            <Icon path={ICON.pencil} />
          </span>
          <span className="flex-1 text-left">{isManager && !isPrivate ? t('chatInfo.manage') : t('chatInfo.more')}</span>
          <span className={`text-fg-secondary transition-transform ${showMore ? 'rotate-180' : ''}`}>
            <Icon path={ICON.chevron} className="w-4 h-4" />
          </span>
        </button>
        {showMore && (
          <div className="px-4 pb-3 pt-1 space-y-3 animate-fade-in">
            <ExportChat chatId={chat.id} />
            {!isPrivate && isManager && (chat.type === 'GROUP' || chat.type === 'CHANNEL') && (
              <>
                <InviteLinkSection chatId={chat.id} />
                <AdminLogSection chatId={chat.id} />
                <JoinRequestsSection chatId={chat.id} approval={(chat as { joinApproval?: boolean }).joinApproval ?? false} />
              </>
            )}
            {isManager && chat.type === 'CHANNEL' && (
              <>
                <CommentsToggle chatId={chat.id} current={(chat as { commentsEnabled?: boolean }).commentsEnabled ?? false} />
                <StatsSection chatId={chat.id} />
              </>
            )}
            {isManager && chat.type === 'GROUP' && (
              <>
                <ForumSection chatId={chat.id} current={(chat as { isForum?: boolean }).isForum ?? false} />
                <SlowModeSection chatId={chat.id} current={(chat as { slowModeSeconds?: number }).slowModeSeconds ?? 0} />
              </>
            )}
          </div>
        )}
      </ProfileSection>

      {!isPrivate && (
        <ProfileSection>
          <ProfileRow
            path={ICON.logout}
            tone="danger"
            label={isLeaving ? t('common.loading') : chat.type === 'CHANNEL' ? t('chatInfo.leave') : t('chatInfo.leave')}
            onClick={onLeave}
          />
        </ProfileSection>
      )}
    </ProfileCard>
  );
}
