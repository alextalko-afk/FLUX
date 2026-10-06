import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useI18n } from '../../../hooks/useI18n';
import { useAuthStore } from '../../../stores/auth.store';
import { useChatsStore, type ChatListItem } from '../../../stores/chats.store';
import { useFolders, type Folder } from '../hooks/useFolders';

const MAX_FOLDERS = 10;

function chatName(chat: ChatListItem, myId: string | undefined, fallback: string): string {
  return (
    chat.title ||
    chat.members
      .filter((member) => member.userId !== myId)
      .map((member) => `${member.user?.firstName ?? ''} ${member.user?.lastName ?? ''}`.trim())
      .filter(Boolean)
      .join(', ') ||
    fallback
  );
}

/** Create, rename, delete folders and choose which chats each one holds. */
export function FolderEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const folders = useFolders();
  const chats = useChatsStore((state) => state.chats);
  const myId = useAuthStore((state) => state.user?.id);
  const [newName, setNewName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['folders'] });
  const onError = (err: unknown) =>
    toast.error(
      err instanceof ApiError && err.code === 'FOLDER_LIMIT_REACHED'
        ? t('chats.folderLimit')
        : t('common.somethingWrong'),
    );

  const create = useMutation({
    mutationFn: (name: string) => api.post<Folder>('/folders', { name }),
    onSuccess: () => {
      setNewName('');
      return refresh();
    },
    onError,
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; chatIds?: string[] }) =>
      api.patch<Folder>(`/folders/${id}`, body),
    onSuccess: refresh,
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/folders/${id}`),
    onSuccess: refresh,
    onError,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (name) create.mutate(name);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('chats.foldersTitle')} size="md">
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <form onSubmit={submit} className="flex gap-2 items-end">
          <div className="flex-1">
            <Input
              label={t('chats.folderNew')}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t('chats.folderNamePlaceholder')}
              maxLength={32}
              disabled={folders.length >= MAX_FOLDERS}
            />
          </div>
          <Button type="submit" isLoading={create.isPending} disabled={!newName.trim() || folders.length >= MAX_FOLDERS}>
            {t('chats.folderCreate')}
          </Button>
        </form>

        {folders.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('chats.foldersEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {folders.map((folder) => (
              <li key={folder.id} className="border border-border rounded-lg bg-bg-panel">
                <div className="flex items-center gap-2 p-2">
                  <input
                    defaultValue={folder.name}
                    maxLength={32}
                    aria-label={t('chats.folderNamePlaceholder')}
                    onBlur={(event) => {
                      const name = event.target.value.trim();
                      if (name && name !== folder.name) update.mutate({ id: folder.id, name });
                      else event.target.value = folder.name;
                    }}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded bg-transparent text-sm text-fg-primary border border-transparent hover:border-border focus:border-fg-accent focus-visible:outline-none"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setOpenId(openId === folder.id ? null : folder.id)}
                    aria-expanded={openId === folder.id}
                  >
                    {t('chats.folderChoose')} · {folder.chatIds.length}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove.mutate(folder.id)}>
                    {t('chats.folderDelete')}
                  </Button>
                </div>

                {openId === folder.id && (
                  <ul className="border-t border-border-subtle max-h-56 overflow-y-auto p-2 space-y-1">
                    {chats.length === 0 && (
                      <li className="text-sm text-fg-secondary px-2 py-1">{t('chats.noChats')}</li>
                    )}
                    {chats.map((chat) => {
                      const checked = folder.chatIds.includes(chat.id);
                      return (
                        <li key={chat.id}>
                          <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-hover text-sm text-fg-primary cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                update.mutate({
                                  id: folder.id,
                                  chatIds: checked
                                    ? folder.chatIds.filter((id) => id !== chat.id)
                                    : [...folder.chatIds, chat.id],
                                })
                              }
                              className="h-4 w-4 accent-fg-accent"
                            />
                            <span className="truncate">{chatName(chat, myId, t('search.chatFallback'))}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
