import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Avatar } from '../../../components/ui/Avatar';
import { useI18n } from '../../../hooks/useI18n';
import { useNavigate } from 'react-router-dom';

interface Contact {
  id: string;
  nickname: string | null;
  isFavorite: boolean;
  createdAt: string;
  user: {
    id: string;
    username: string | null;
    firstName: string;
    lastName: string | null;
    avatarUrl: string | null;
  };
}

export function ContactsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get<{ items: Contact[] }>('/contacts'),
  });

  const addMutation = useMutation({
    mutationFn: (username: string) => api.post('/contacts', { targetUsername: username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(t('contacts.added'));
      setIsAddOpen(false);
      setAddUsername('');
    },
    onError: () => {
      toast.error(t('contacts.addFailed'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (contactId: string) => api.delete(`/contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(t('contacts.removed'));
    },
    onError: () => {
      toast.error(t('contacts.removeFailed'));
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ contactId, isFavorite }: { contactId: string; isFavorite: boolean }) =>
      api.patch(`/contacts/${contactId}`, { isFavorite: !isFavorite }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: () => {
      toast.error(t('contacts.updateFailed'));
    },
  });

  const contacts = data?.items || [];
  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      c.user.firstName.toLowerCase().includes(query) ||
      c.user.lastName?.toLowerCase().includes(query) ||
      c.user.username?.toLowerCase().includes(query) ||
      c.nickname?.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-fg-primary">{t('contacts.title')}</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setIsAddOpen(true)}>
            {t('contacts.add')}
          </Button>
        </div>
      </div>

      <Input
        placeholder={t('contacts.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={t('contacts.none')}
          description={t('contacts.noneDescription')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-3 p-3.5 bg-bg-elevated border border-border rounded-panel shadow-panel transition-all duration-200 ease-spring hover:border-fg-accent/40 hover:shadow-float hover:-translate-y-0.5"
            >
              <button
                onClick={() => navigate(`/u/${contact.user.id}`)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <Avatar
                  name={`${contact.user.firstName} ${contact.user.lastName || ''}`}
                  avatarUrl={contact.user.avatarUrl}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-fg-primary truncate">
                    {contact.nickname || `${contact.user.firstName} ${contact.user.lastName || ''}`.trim()}
                  </div>
                  {contact.user.username && (
                    <div className="text-xs text-fg-secondary truncate">@{contact.user.username}</div>
                  )}
                </div>
              </button>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    toggleFavoriteMutation.mutate({
                      contactId: contact.id,
                      isFavorite: contact.isFavorite,
                    })
                  }
                  aria-label={contact.isFavorite ? t('contacts.removeFavorite') : t('contacts.addFavorite')}
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill={contact.isFavorite ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeMutation.mutate(contact.id)}
                  aria-label={t('contacts.remove')}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setAddUsername('');
        }}
        title={t('contacts.add')}
        size="sm"
      >
        <div className="p-5 space-y-4">
          <Input
            label={t('auth.username')}
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
            placeholder="@username"
            hint={t('contacts.usernameHint')}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsAddOpen(false);
                setAddUsername('');
              }}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => addMutation.mutate(addUsername.replace('@', ''))}
              isLoading={addMutation.isPending}
              disabled={!addUsername.trim()}
              className="flex-1"
            >
              {t('common.add')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
