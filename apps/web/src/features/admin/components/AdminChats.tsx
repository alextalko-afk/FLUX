import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Input } from '../../../components/ui/Input';

type ChatType = 'PRIVATE' | 'GROUP' | 'CHANNEL' | string;
type ChatAction = 'ARCHIVE' | 'UNARCHIVE' | 'DELETE';

interface AdminChat {
  id: string;
  type: ChatType;
  title: string | null;
  description: string | null;
  isPublic: boolean;
  isArchived: boolean;
  createdAt: string;
  _count: {
    members: number;
    messages: number;
    reports: number;
  };
}

/** Colour used for the type badge, so the three chat kinds read differently. */
function typeBadgeClass(type: ChatType): string {
  switch (type) {
    case 'PRIVATE':
      return 'bg-fg-accent/10 text-fg-accent';
    case 'GROUP':
      return 'bg-fg-success/10 text-fg-success';
    case 'CHANNEL':
      return 'bg-fg-warning/10 text-fg-warning';
    default:
      return 'bg-bg-hover text-fg-secondary';
  }
}

export function AdminChats() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedChat, setSelectedChat] = useState<AdminChat | null>(null);
  const [pendingAction, setPendingAction] = useState<ChatAction | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'chats', search],
    queryFn: () =>
      api.get<{ items: AdminChat[]; nextCursor: string | null }>(
        `/admin/chats?limit=50${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const actionMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/chats/action', {
        chatId: selectedChat?.id,
        action: pendingAction,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'chats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      toast.success(closeAndLabel(pendingAction));
      closeModal();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    },
  });

  function closeAndLabel(action: ChatAction | null): string {
    switch (action) {
      case 'ARCHIVE':
        return 'Chat archived';
      case 'UNARCHIVE':
        return 'Chat unarchived';
      case 'DELETE':
        return 'Chat deleted';
      default:
        return 'Done';
    }
  }

  function closeModal() {
    setSelectedChat(null);
    setPendingAction(null);
    setReason('');
  }

  function openAction(chat: AdminChat, action: ChatAction) {
    setSelectedChat(chat);
    setPendingAction(action);
  }

  const chats = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-fg-primary">Chats</h2>
        <div className="w-72">
          <Input
            placeholder="Search by title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {chats.length === 0 ? (
        <div className="p-8 text-center text-sm text-fg-secondary bg-bg-panel border border-border rounded-lg">
          No chats found
        </div>
      ) : (
        <div className="space-y-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="bg-bg-panel border border-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${typeBadgeClass(chat.type)}`}
                    >
                      {chat.type}
                    </span>
                    {chat.isPublic && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-bg-hover text-fg-secondary">
                        PUBLIC
                      </span>
                    )}
                    {chat.isArchived && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-fg-warning/10 text-fg-warning">
                        ARCHIVED
                      </span>
                    )}
                    <span className="text-xs text-fg-tertiary">
                      {formatDistanceToNow(new Date(chat.createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  <div className="text-sm text-fg-primary mb-1 truncate">
                    {chat.title || 'Untitled chat'}
                  </div>

                  {chat.description && (
                    <div className="text-xs text-fg-secondary mb-1 truncate">
                      {chat.description}
                    </div>
                  )}

                  <div className="text-xs text-fg-secondary flex items-center gap-3">
                    <span>{chat._count.members} members</span>
                    <span>{chat._count.messages} messages</span>
                    {chat._count.reports > 0 && (
                      <span className="text-fg-error">
                        {chat._count.reports} reports
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {chat.isArchived ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openAction(chat, 'UNARCHIVE')}
                    >
                      Unarchive
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openAction(chat, 'ARCHIVE')}
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => openAction(chat, 'DELETE')}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={pendingAction !== null}
        onClose={closeModal}
        title={
          pendingAction === 'DELETE'
            ? 'Delete chat'
            : pendingAction === 'ARCHIVE'
              ? 'Archive chat'
              : 'Unarchive chat'
        }
        size="md"
      >
        <div className="p-5 space-y-4">
          {selectedChat && (
            <div className="text-sm text-fg-secondary">
              Chat:{' '}
              <strong className="text-fg-primary">
                {selectedChat.title || 'Untitled chat'}
              </strong>
            </div>
          )}

          {pendingAction === 'DELETE' && (
            <div className="text-sm text-fg-error">
              This permanently deletes the chat with all of its messages. This
              cannot be undone.
            </div>
          )}

          {pendingAction === 'ARCHIVE' && (
            <div className="text-sm text-fg-secondary">
              Archived chats are hidden from the regular chat list. Members and
              history are preserved.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1.5">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-bg-app border border-border rounded-lg text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none focus:ring-2 focus:ring-fg-accent resize-none"
              placeholder="Why is this action being taken?"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={closeModal} className="flex-1">
              Cancel
            </Button>
            <Button
              variant={pendingAction === 'DELETE' ? 'danger' : 'primary'}
              onClick={() => actionMutation.mutate()}
              isLoading={actionMutation.isPending}
              className="flex-1"
            >
              {pendingAction === 'DELETE' ? 'Delete' : 'Confirm'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
