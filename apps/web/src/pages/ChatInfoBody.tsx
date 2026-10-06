import { useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useClickOutside } from '../hooks/useClickOutside';
import type { ChatDetails, ChatMember, SearchedUser } from './types';
import { JoinRequestsSection } from '../features/chats/components/JoinRequestsSection';
import { ExportChat } from '../features/chats/components/ExportChat';
import { AdminLogSection } from '../features/chats/components/AdminLogSection';
import { CommentsToggle, StatsSection } from '../features/chats/components/ChannelSettings';
import { ForumSection } from '../features/chats/components/ForumSection';
import { SlowModeSection } from '../features/chats/components/SlowModeSection';
import { InviteLinkSection } from '../features/chats/components/InviteLinkSection';

export const displayName = (u?: { firstName: string; lastName?: string | null } | null) =>
  u ? `${u.firstName} ${u.lastName || ''}`.trim() : '';

const TYPE_LABEL: Record<string, string> = {
  PRIVATE: 'chats.personalChat',
  GROUP: 'chats.group',
  CHANNEL: 'chats.channel',
  SAVED: 'chats.personalChat',
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'chatInfo.owner',
  ADMIN: 'chatInfo.admin',
  MEMBER: 'chatInfo.member',
};

export interface ChatInfoBodyProps {
  chat: ChatDetails;
  chatTitle: string;
  isPrivate: boolean;
  isManager: boolean;
  isOwner: boolean;
  isMuted: boolean;
  messageCount: number;
  createdAt: string;
  members: ChatMember[];
  addable: SearchedUser[];
  isEditing: boolean;
  title: string;
  description: string;
  memberQuery: string;
  isSaving: boolean;
  isAdding: boolean;
  myId: string;
  onOpenProfile: (id: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSave: () => void;
  onMemberQueryChange: (v: string) => void;
  onAddMember: (id: string) => void;
  onRemoveMember: (id: string) => void;
  onPromote: (id: string) => void;
  onToggleMute: (next: boolean) => void;
  onLeave: () => void;
  isLeaving: boolean;
}

/** Presentational half of the chat info screen; all mutations live in the page. */
export function ChatInfoBody(props: ChatInfoBodyProps) {
  const {
    chat,
    chatTitle,
    isPrivate,
    isManager,
    isOwner,
    isMuted,
    members,
    addable,
    isEditing,
    title,
    description,
    memberQuery,
    isSaving,
    isAdding,
    myId,
    onOpenProfile,
    onStartEdit,
    onCancelEdit,
    onTitleChange,
    onDescriptionChange,
    onSave,
    onMemberQueryChange,
    onAddMember,
    onRemoveMember,
    onPromote,
    onToggleMute,
    onLeave,
    isLeaving,
  } = props;

  const { t } = useI18n();
  const [showMore, setShowMore] = useState(false);
  const onlineCount = members.filter((m) => m.user.presence === 'ONLINE').length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full pb-6">
        {/* Who this is */}
        <div className="flex items-center gap-4 px-5 pt-4 pb-4">
          <Avatar
            name={chatTitle}
            avatarUrl={chat.avatarUrl}
            size="lg"
            circleClassName="w-16 h-16 text-xl"
            isGroup={chat.type === 'GROUP'}
            isChannel={chat.type === 'CHANNEL'}
          />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-fg-primary tracking-tight break-words leading-snug">{chatTitle}</h2>
            <div className="text-[13px] text-fg-secondary">
              {isPrivate
                ? t(TYPE_LABEL[chat.type] || 'chats.personalChat')
                : `${t(TYPE_LABEL[chat.type] || 'chats.group')} · ${members.length} (${onlineCount} ${t('profile.online')})`}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        {!isPrivate && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            <ActionButton
              onClick={() => onToggleMute(!isMuted)}
              label={isMuted ? t('chatInfo.unmute') : t('chatInfo.mute')}
              path={isMuted ? 'M13.7 21a2 2 0 0 1-3.4 0M18 8a6 6 0 0 0-9.3-5M6 6a6 6 0 0 0 0 2c0 7-3 9-3 9h14M1 1l22 22' : 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'}
            />
            <ActionButton
              onClick={onLeave}
              disabled={isLeaving}
              danger
              label={t('chatInfo.leave')}
              path="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
            />
          </div>
        )}

        {/* Facts about the chat */}
        {!isPrivate && (
          <div className="border-t border-border-subtle py-1">
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
              <InfoRow
                path="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01"
                label={t('chatInfo.description')}
                action={isManager ? { text: t('common.edit'), onClick: onStartEdit } : undefined}
              >
                {chat.description || t('chatInfo.noDescription')}
              </InfoRow>
            )}
            {(chat as { e2ee?: boolean }).e2ee && (
              <InfoRow
                path="M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4"
                label={t('chats.e2eeBadge')}
                tone="success"
              >
                {t('chats.e2eeGroupReady')}
              </InfoRow>
            )}
          </div>
        )}

        {/* Members */}
        {!isPrivate && (
          <section className="border-t border-border-subtle pt-3 mt-1">
            <h3 className="px-5 pb-1 text-xs font-semibold text-fg-secondary uppercase tracking-[0.1em]">
              {`${t('chatInfo.members')} · ${members.length}`}
            </h3>

            {isManager && (
              <div className="px-4 pb-1">
                <Input
                  value={memberQuery}
                  onChange={(e) => onMemberQueryChange(e.target.value)}
                  placeholder={t('chatInfo.searchPeople')}
                />
                {addable.length > 0 && (
                  <div className="mt-1 max-h-52 overflow-y-auto">
                    {addable.map((candidate) => (
                      <button
                        key={candidate.id}
                        disabled={isAdding}
                        onClick={() => onAddMember(candidate.id)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-bg-hover transition-colors text-left disabled:opacity-50"
                      >
                        <Avatar name={displayName(candidate)} avatarUrl={candidate.avatarUrl} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-fg-primary truncate">{displayName(candidate)}</div>
                          {candidate.username && <div className="text-xs text-fg-secondary truncate">@{candidate.username}</div>}
                        </div>
                        <span className="text-fg-accent text-xs font-medium">{t('common.add')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="px-2 space-y-0.5">
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
          </section>
        )}

        {/* Everything else lives behind one fold, so the panel stays calm. */}
        <div className="border-t border-border-subtle mt-3">
          <button
            onClick={() => setShowMore((open) => !open)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-fg-primary hover:bg-bg-hover transition-colors"
            aria-expanded={showMore}
          >
            {isManager && !isPrivate ? t('chatInfo.manage') : t('chatInfo.more')}
            <svg
              className={`w-4 h-4 text-fg-secondary transition-transform ${showMore ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showMore && (
            <div className="px-4 pb-4 space-y-3 animate-fade-in">
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
        </div>
      </div>
    </div>
  );
}

/** A square quick-action button with a line icon. */
function ActionButton({
  label,
  path,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  path: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-bg-elevated transition-colors text-[12px] font-medium disabled:opacity-50 ${
        danger ? 'text-fg-error hover:bg-fg-error/10' : 'text-fg-primary hover:bg-bg-hover'
      }`}
    >
      <svg
        className={`w-5 h-5 ${danger ? '' : 'text-fg-accent'}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
      <span className="leading-tight text-center px-1">{label}</span>
    </button>
  );
}

/** An icon, the value, and a small caption under it: the rows of the "facts" list. */
function InfoRow({
  path,
  label,
  children,
  action,
  tone,
}: {
  path: string;
  label: string;
  children: React.ReactNode;
  action?: { text: string; onClick: () => void };
  tone?: 'success';
}) {
  return (
    <div className="flex items-start gap-4 px-5 py-2.5">
      <svg
        className={`w-5 h-5 mt-0.5 flex-shrink-0 ${tone === 'success' ? 'text-fg-success' : 'text-fg-tertiary'}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-fg-primary whitespace-pre-wrap break-words">{children}</div>
        <div className="text-xs text-fg-secondary mt-0.5">{label}</div>
      </div>
      {action && (
        <button onClick={action.onClick} className="text-xs font-medium text-fg-accent hover:underline flex-shrink-0 mt-0.5">
          {action.text}
        </button>
      )}
    </div>
  );
}

interface MemberRowProps {
  member: ChatMember;
  canManage: boolean;
  canPromote: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onPromote: () => void;
}

/**
 * One row of the member list. The role badge doubles as the menu trigger so
 * management actions stay out of the way until they are actually needed.
 */
export function MemberRow({
  member,
  canManage,
  canPromote,
  onOpen,
  onRemove,
  onPromote,
}: MemberRowProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  const name = displayName(member.user);
  const isOnline = member.user.presence === 'ONLINE';
  const roleLabel = t(ROLE_LABEL[member.role] || 'chatInfo.member');

  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-bg-hover transition-colors">
      <button onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <Avatar
          name={name}
          avatarUrl={member.user.avatarUrl}
          size="sm"
          presence={isOnline ? 'ONLINE' : undefined}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg-primary truncate">{name}</div>
          {member.user.username && (
            <div className="text-xs text-fg-secondary truncate">@{member.user.username}</div>
          )}
        </div>
      </button>

      {canManage ? (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="text-xs font-medium text-fg-accent px-2 py-1 rounded-lg hover:bg-bg-active transition-colors"
          >
            {roleLabel}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-bg-panel border border-border rounded-xl shadow-dropdown py-1 animate-scale-in origin-top-right">
              {canPromote && member.role !== 'ADMIN' && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onPromote();
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-fg-primary hover:bg-bg-hover transition-colors"
                >
                  {t('chatInfo.makeAdmin')}
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRemove();
                }}
                className="w-full text-left px-3 py-2 text-sm text-fg-error hover:bg-bg-hover transition-colors"
              >
                {t('chatInfo.removeMember')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <span className="text-xs text-fg-tertiary">{roleLabel}</span>
      )}
    </div>
  );
}
