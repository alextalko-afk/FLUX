import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { useDebounce } from '../hooks/useDebounce';
import { useChatsStore } from '../stores/chats.store';
import { Tabs } from '../components/ui/Tabs';
import { useI18n } from '../hooks/useI18n';
import { useAuthStore } from '../stores/auth.store';
import { ensureIdentity } from '../services/e2ee/keystore';
import { ApiError } from '../lib/api';

type Mode = 'personal' | 'secret' | 'group' | 'channel';

interface SearchedUser {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

export function NewChatPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const { handleChatUpsert } = useChatsStore();
  const myId = useAuthStore((state) => state.user?.id);

  const [mode, setMode] = useState<Mode>('personal');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const [title, setTitle] = useState('');
  const [encrypted, setEncrypted] = useState(false);
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [selected, setSelected] = useState<SearchedUser[]>([]);

  const autoCreatedRef = useRef(false);

  const { data: users = [], isFetching } = useQuery<SearchedUser[]>({
    queryKey: ['search', 'users', debouncedQuery],
    queryFn: () =>
      api.get<SearchedUser[]>(`/search/users?q=${encodeURIComponent(debouncedQuery)}&limit=30`),
    enabled: debouncedQuery.trim().length >= 1,
  });

  const finish = (chat: any) => {
    handleChatUpsert(chat);
    queryClient.invalidateQueries({ queryKey: ['chats'] });
    navigate(`/chats/${chat.id}`, { replace: true });
  };

  const privateMutation = useMutation({
    mutationFn: (targetUserId: string) => api.post<any>('/chats/private', { targetUserId }),
    onSuccess: finish,
    onError: (err: any) => toast.error(err?.message || t('chats.createFailed')),
  });

  // A secret chat is bound to this device's key, so the key is created and
  // registered first. The server then picks the other person's device.
  const secretMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const identity = await ensureIdentity(myId ?? '');
      return api.post<any>('/chats/secret', { targetUserId, deviceKeyId: identity.deviceKeyId });
    },
    onSuccess: finish,
    onError: (err: unknown) =>
      toast.error(
        err instanceof ApiError && err.code === 'SECRET_PEER_UNAVAILABLE'
          ? t('chats.secretPeerUnavailable')
          : err instanceof ApiError
            ? err.message
            : t('chats.createFailed'),
      ),
  });

  const groupMutation = useMutation({
    mutationFn: async () => {
      // An encrypted group needs this device's key registered first.
      if (encrypted) await ensureIdentity(myId ?? '');
      return api.post<any>('/chats/group', {
        title: title.trim(),
        description: description.trim() || undefined,
        memberIds: selected.map((u) => u.id),
        e2ee: encrypted || undefined,
      });
    },
    onSuccess: finish,
    onError: (err: any) => toast.error(err?.message || t('chats.groupFailed')),
  });

  const channelMutation = useMutation({
    mutationFn: () =>
      api.post<any>('/chats/channel', {
        title: title.trim(),
        description: description.trim() || undefined,
        isPublic,
      }),
    onSuccess: finish,
    onError: (err: any) => toast.error(err?.message || t('chats.channelFailed')),
  });

  // `SearchPage` navigates to `/chats/new?user=<id>` to start a dialog directly.
  const targetUser = searchParams.get('user');
  useEffect(() => {
    if (!targetUser || autoCreatedRef.current) return;
    autoCreatedRef.current = true;
    privateMutation.mutate(targetUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUser]);

  const toggleSelected = (user: SearchedUser) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const isCreating =
    privateMutation.isPending ||
    secretMutation.isPending ||
    groupMutation.isPending ||
    channelMutation.isPending;

  const canSubmitGroup = title.trim().length > 0 && selected.length >= 1;
  const canSubmitChannel = title.trim().length > 0;

  const modes: { id: Mode; label: string }[] = [
    { id: 'personal', label: t('chats.personalChat') },
    { id: 'secret', label: t('chats.secretMode') },
    { id: 'group', label: t('chats.group') },
    { id: 'channel', label: t('chats.channel') },
  ];

  return (
    <div className="flex-1 flex flex-col bg-bg-app overflow-hidden animate-fade-in">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-border-subtle bg-bg-panel/70 backdrop-blur-xl backdrop-saturate-150 shrink-0">
        <Button size="sm" variant="ghost" onClick={() => navigate('/chats')} aria-label={t('common.back')}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Button>
        <h1 className="text-lg font-semibold text-fg-primary">{t('chats.newChat')}</h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
          <div className="overflow-x-auto">
            <Tabs items={modes} value={mode} onChange={setMode} ariaLabel={t('chats.newChat')} />
          </div>
          <NewChatBody
            mode={mode}
            query={query}
            setQuery={setQuery}
            users={users}
            isFetching={isFetching}
            debouncedQuery={debouncedQuery}
            selected={selected}
            toggleSelected={toggleSelected}
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            encrypted={encrypted}
            setEncrypted={setEncrypted}
            isPublic={isPublic}
            setIsPublic={setIsPublic}
            canSubmitGroup={canSubmitGroup}
            canSubmitChannel={canSubmitChannel}
            isCreating={isCreating}
            isGroupPending={groupMutation.isPending}
            isChannelPending={channelMutation.isPending}
            onCreatePrivate={privateMutation.mutate}
            onCreateSecret={secretMutation.mutate}
            onCreateGroup={() => groupMutation.mutate()}
            onCreateChannel={() => channelMutation.mutate()}
          />
        </div>
      </div>
    </div>
  );
}

interface NewChatBodyProps {
  mode: Mode;
  query: string;
  setQuery: (v: string) => void;
  users: SearchedUser[];
  isFetching: boolean;
  debouncedQuery: string;
  selected: SearchedUser[];
  toggleSelected: (u: SearchedUser) => void;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  encrypted: boolean;
  setEncrypted: (v: boolean) => void;
  isPublic: boolean;
  setIsPublic: (v: boolean) => void;
  canSubmitGroup: boolean;
  canSubmitChannel: boolean;
  isCreating: boolean;
  isGroupPending: boolean;
  isChannelPending: boolean;
  onCreatePrivate: (id: string) => void;
  onCreateSecret: (id: string) => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
}

function UserRow({
  user,
  selected,
  onClick,
}: {
  user: SearchedUser;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
        selected ? 'bg-bg-active' : 'hover:bg-bg-hover',
      )}
    >
      <div className="w-10 h-10 rounded-full bg-fg-accent flex items-center justify-center text-fg-on-accent font-semibold flex-shrink-0">
        {user.firstName?.[0]?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-fg-primary truncate">
          {user.firstName} {user.lastName || ''}
        </div>
        {user.username && (
          <div className="text-xs text-fg-secondary truncate">@{user.username}</div>
        )}
      </div>
      {selected && (
        <div className="w-5 h-5 rounded-full bg-fg-accent flex items-center justify-center text-fg-on-accent flex-shrink-0">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </button>
  );
}

function UserPicker({
  query,
  setQuery,
  users,
  isFetching,
  debouncedQuery,
  placeholder,
}: {
  query: string;
  setQuery: (v: string) => void;
  users: SearchedUser[];
  isFetching: boolean;
  debouncedQuery: string;
  placeholder: string;
}) {
  const { t } = useI18n();
  const hasQuery = debouncedQuery.trim().length >= 1;
  return (
    <>
      <Input placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {hasQuery && isFetching && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {hasQuery && !isFetching && users.length === 0 && (
        <EmptyState
          title={t('search.noResults')}
          description={t('search.nothingFound', {
            scope: t('search.users'),
            query: debouncedQuery,
          })}
        />
      )}
    </>
  );
}

function NewChatBody(p: NewChatBodyProps) {
  const { t } = useI18n();
  const isSelected = (u: SearchedUser) => p.selected.some((s) => s.id === u.id);

  if (p.mode === 'personal' || p.mode === 'secret') {
    return (
      <div className="space-y-4">
        {p.mode === 'secret' && (
          <p className="text-sm text-fg-secondary p-3 rounded-lg bg-bg-hover">{t('chats.secretIntro')}</p>
        )}
        <UserPicker
          query={p.query}
          setQuery={p.setQuery}
          users={p.users}
          isFetching={p.isFetching}
          debouncedQuery={p.debouncedQuery}
          placeholder={t('search.placeholder')}
        />
        <div className="space-y-1">
          {p.users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              selected={false}
              onClick={() =>
                !p.isCreating && (p.mode === 'secret' ? p.onCreateSecret(user.id) : p.onCreatePrivate(user.id))
              }
            />
          ))}
        </div>
      </div>
    );
  }

  if (p.mode === 'group') {
    return (
      <div className="space-y-4">
        <Input
          label={t('chats.groupName')}
          value={p.title}
          onChange={(e) => p.setTitle(e.target.value)}
          placeholder={t('chats.myGroup')}
          maxLength={128}
        />
        <Input
          label={t('chats.description')}
          value={p.description}
          onChange={(e) => p.setDescription(e.target.value)}
          placeholder={t('chats.descriptionPlaceholder')}
          maxLength={500}
        />
        <label className="flex items-start gap-2 text-sm text-fg-primary cursor-pointer">
          <input
            type="checkbox"
            checked={p.encrypted}
            onChange={(e) => p.setEncrypted(e.target.checked)}
            className="mt-1"
            data-testid="group-encrypted"
          />
          <span>
            {t('chats.groupEncrypted')}
            <span className="block text-xs text-fg-secondary">{t('chats.groupEncryptedHint')}</span>
          </span>
        </label>
        {p.selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.selected.map((user) => (
              <button
                key={user.id}
                onClick={() => p.toggleSelected(user)}
                className="flex items-center gap-1.5 px-2 py-1 bg-bg-hover border border-border rounded-full text-xs text-fg-primary hover:bg-bg-active"
              >
                {user.firstName} {user.lastName || ''}
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ))}
          </div>
        )}
        <UserPicker
          query={p.query}
          setQuery={p.setQuery}
          users={p.users}
          isFetching={p.isFetching}
          debouncedQuery={p.debouncedQuery}
          placeholder={t('chats.addPeople')}
        />
        <div className="space-y-1">
          {p.users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              selected={isSelected(user)}
              onClick={() => p.toggleSelected(user)}
            />
          ))}
        </div>
        <Button
          onClick={p.onCreateGroup}
          disabled={!p.canSubmitGroup}
          isLoading={p.isGroupPending}
          className="w-full"
        >
          {t('chats.createGroup')}
        </Button>
      </div>
    );
  }

  // The mode union has exactly three members, so reaching this point means
  // "channel". The guard keeps that explicit and makes an unexpected mode
  // render nothing rather than silently showing the channel form.
  if (p.mode !== 'channel') {
    return null;
  }

  return (
    <div className="space-y-4">
      <Input
        label={t('chats.channelName')}
        value={p.title}
        onChange={(e) => p.setTitle(e.target.value)}
        placeholder={t('chats.myChannel')}
        maxLength={128}
      />
      <Input
        label={t('chats.description')}
        value={p.description}
        onChange={(e) => p.setDescription(e.target.value)}
        placeholder={t('chats.descriptionPlaceholder')}
        maxLength={500}
      />
      <label className="flex items-center gap-3 p-3 bg-bg-panel border border-border rounded-lg cursor-pointer">
        <input
          type="checkbox"
          checked={p.isPublic}
          onChange={(e) => p.setIsPublic(e.target.checked)}
          className="w-4 h-4"
        />
        <div>
          <div className="text-sm font-medium text-fg-primary">{t('chats.publicChannel')}</div>
          <div className="text-xs text-fg-secondary">{t('chats.publicChannelHint')}</div>
        </div>
      </label>
      <Button
        onClick={p.onCreateChannel}
        disabled={!p.canSubmitChannel}
        isLoading={p.isChannelPending}
        className="w-full"
      >
        {t('chats.createChannel')}
      </Button>
    </div>
  );
}

