import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Input } from '../components/ui/Input';
import { useDebounce } from '../hooks/useDebounce';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import { useI18n } from '../hooks/useI18n';

type SearchScope = 'all' | 'users' | 'chats' | 'messages';

interface SearchResult {
  users?: any[];
  chats?: any[];
  messages?: any[];
}

export function SearchPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  // `?q=` lets a clicked #hashtag or @mention open the search already filled in.
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [scope, setScope] = useState<SearchScope>('all');
  const debouncedQuery = useDebounce(query, 300);

  const { data, isLoading } = useQuery<SearchResult>({
    queryKey: ['search', debouncedQuery, scope],
    queryFn: () => {
      const params = new URLSearchParams({ q: debouncedQuery });
      if (scope !== 'all') params.set('scope', scope);
      return api.get<SearchResult>(`/search?${params}`);
    },
    enabled: debouncedQuery.length >= 2,
  });

  const scopes: { id: SearchScope; label: string }[] = [
    { id: 'all', label: t('search.all') },
    { id: 'users', label: t('search.users') },
    { id: 'chats', label: t('search.chats') },
    { id: 'messages', label: t('search.messages') },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-fg-primary">{t('search.title')}</h1>

      <Input
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="overflow-x-auto">
        <Tabs items={scopes} value={scope} onChange={setScope} ariaLabel={t('search.title')} />
      </div>

      {debouncedQuery.length < 2 && (
        <EmptyState
          title={t('search.startTyping')}
          description={t('search.startTypingDescription')}
        />
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {data && !isLoading && (
        <div className="space-y-6">
          {(scope === 'all' || scope === 'users') && data.users && data.users.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-fg-secondary mb-2">{t('search.users')}</h3>
              <div className="space-y-1">
                {data.users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => navigate(`/chats/new?user=${user.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-bg-hover transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-fg-accent flex items-center justify-center text-fg-on-accent font-semibold">
                      {user.firstName[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-fg-primary truncate">
                        {user.firstName} {user.lastName || ''}
                      </div>
                      {user.username && (
                        <div className="text-xs text-fg-secondary truncate">@{user.username}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(scope === 'all' || scope === 'chats') && data.chats && data.chats.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-fg-secondary mb-2">{t('search.chats')}</h3>
              <div className="space-y-1">
                {data.chats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => navigate(`/chats/${chat.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-bg-hover transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-fg-accent flex items-center justify-center text-fg-on-accent font-semibold">
                      {chat.title?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-fg-primary truncate">
                        {chat.title || t('search.chatFallback')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(scope === 'all' || scope === 'messages') && data.messages && data.messages.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-fg-secondary mb-2">{t('search.messages')}</h3>
              <div className="space-y-1">
                {data.messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => navigate(`/chats/${msg.chatId}`)}
                    className="w-full p-3 rounded-lg hover:bg-bg-hover transition-colors text-left"
                  >
                    <div className="text-xs text-fg-secondary mb-1">
                      {msg.sender?.firstName} {msg.sender?.lastName || ''}
                    </div>
                    <div className="text-sm text-fg-primary truncate">{msg.content}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isLoading &&
            !(scope === 'all' || scope === 'users' ? data.users?.length : 0) &&
            !(scope === 'all' || scope === 'chats' ? data.chats?.length : 0) &&
            !(scope === 'all' || scope === 'messages' ? data.messages?.length : 0) &&
            debouncedQuery.length >= 2 && (
              <EmptyState
                title={t('search.noResults')}
                description={t('search.nothingFound', {
                  scope: scopes.find((s) => s.id === scope)?.label ?? '',
                  query: debouncedQuery,
                })}
              />
            )}
        </div>
      )}
    </div>
  );
}
