import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useDebounce } from '../../../hooks/useDebounce';

interface AdminUser {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: string;
  isBlocked: boolean;
  isVerified: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  emails: { email: string }[];
  _count: {
    chatMembers: number;
    sentMessages: number;
    reports: number;
  };
}

export function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', debouncedSearch, cursor],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      return api.get<{ items: AdminUser[]; nextCursor: string | null }>(`/admin/users?${params}`);
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ userId, action, newPassword, reason }: any) => {
      return api.post('/admin/users/action', {
        userId,
        action,
        newPassword,
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Action completed');
      setIsActionModalOpen(false);
      setSelectedUser(null);
      setNewPassword('');
      setReason('');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Action failed');
      }
    },
  });

  const users = data?.items || [];

  const openActionModal = (user: AdminUser, action: string) => {
    setSelectedUser(user);
    setActionType(action);
    setIsActionModalOpen(true);
  };

  const handleAction = () => {
    if (!selectedUser) return;
    actionMutation.mutate({
      userId: selectedUser.id,
      action: actionType,
      newPassword: actionType === 'RESET_PASSWORD' ? newPassword : undefined,
      reason,
    });
  };

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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-fg-primary">Users</h2>
        <div className="text-sm text-fg-secondary">
          {users.length} users loaded
        </div>
      </div>

      <Input
        placeholder="Search by name, username, email..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setCursor(null);
        }}
      />

      <div className="bg-bg-panel border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg-hover border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-fg-secondary">User</th>
                <th className="text-left px-4 py-3 font-medium text-fg-secondary">Email</th>
                <th className="text-left px-4 py-3 font-medium text-fg-secondary">Role</th>
                <th className="text-left px-4 py-3 font-medium text-fg-secondary">Status</th>
                <th className="text-left px-4 py-3 font-medium text-fg-secondary">Activity</th>
                <th className="text-right px-4 py-3 font-medium text-fg-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-fg-accent flex items-center justify-center text-fg-on-accent text-xs font-semibold flex-shrink-0">
                        {user.firstName[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-fg-primary truncate">
                          {user.firstName} {user.lastName || ''}
                        </div>
                        {user.username && (
                          <div className="text-xs text-fg-secondary truncate">@{user.username}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary truncate max-w-[200px]">
                    {user.emails[0]?.email || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      user.role === 'ADMIN'
                        ? 'bg-fg-error/10 text-fg-error'
                        : user.role === 'MODERATOR'
                        ? 'bg-fg-accent/10 text-fg-accent'
                        : 'bg-bg-hover text-fg-secondary'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {user.isBlocked && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-fg-error/10 text-fg-error">
                          Blocked
                        </span>
                      )}
                      {user.isVerified && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-fg-success/10 text-fg-success">
                          Verified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-secondary">
                    {user.lastSeenAt
                      ? formatDistanceToNow(new Date(user.lastSeenAt), { addSuffix: true })
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openActionModal(user, user.isBlocked ? 'UNBAN' : 'BAN')}
                      >
                        {user.isBlocked ? 'Unban' : 'Ban'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openActionModal(user, 'RESET_PASSWORD')}
                      >
                        Reset pwd
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openActionModal(user, 'REVOKE_SESSIONS')}
                      >
                        Logout
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="p-8 text-center text-sm text-fg-secondary">
            No users found
          </div>
        )}
      </div>

      {data?.nextCursor && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setCursor(data.nextCursor)}>
            Load more
          </Button>
        </div>
      )}

      <Modal
        isOpen={isActionModalOpen}
        onClose={() => {
          setIsActionModalOpen(false);
          setSelectedUser(null);
          setNewPassword('');
          setReason('');
        }}
        title={`Confirm action: ${actionType}`}
        size="sm"
      >
        <div className="p-5 space-y-4">
          {selectedUser && (
            <div className="text-sm text-fg-secondary">
              User: <strong className="text-fg-primary">{selectedUser.firstName} {selectedUser.lastName || ''}</strong>
              {selectedUser.username && <span> (@{selectedUser.username})</span>}
            </div>
          )}

          {actionType === 'RESET_PASSWORD' && (
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1.5">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-bg-app border border-border rounded-lg text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none focus:ring-2 focus:ring-fg-accent resize-none"
              placeholder="Why is this action being taken?"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsActionModalOpen(false);
                setSelectedUser(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant={actionType === 'BAN' || actionType === 'DELETE' ? 'danger' : 'primary'}
              onClick={handleAction}
              isLoading={actionMutation.isPending}
              disabled={actionType === 'RESET_PASSWORD' && newPassword.length < 8}
              className="flex-1"
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
