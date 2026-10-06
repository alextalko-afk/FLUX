import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { useI18n } from '../../../hooks/useI18n';
import type { ChatListItem } from '../../../stores/chats.store';
import type { Folder } from './useFolders';

/**
 * Personal organisation of the chat list: pin, mute, archive and folders.
 *
 * None of these update local state themselves. The server answers a change by
 * pushing the new list entry (or folder list) to every one of the user's
 * devices, this one included, so all of them end up identical.
 */
export function useChatActions() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PINNED_CHATS_LIMIT') {
        toast.error(t('chats.pinLimit'));
      } else if (err instanceof ApiError && err.code === 'FOLDER_CHATS_LIMIT') {
        toast.error(t('chats.folderChatsLimit'));
      } else {
        toast.error(t('common.somethingWrong'));
      }
    }
  };

  return {
    setPinned: (chat: ChatListItem, isPinned: boolean) =>
      run(() => api.patch(`/chats/${chat.id}/pin`, { isPinned })),

    setMuted: (chat: ChatListItem, isMuted: boolean) =>
      run(() => api.patch(`/chats/${chat.id}/mute`, { isMuted })),

    setArchived: (chat: ChatListItem, isArchived: boolean) =>
      run(async () => {
        await api.patch(`/chats/${chat.id}/archive`, { isArchived });
        await queryClient.invalidateQueries({ queryKey: ['chats', 'archived'] });
      }),

    /** Adds the chat to the folder, or removes it when it is already there. */
    toggleInFolder: (chat: ChatListItem, folder: Folder) =>
      run(() => {
        const chatIds = folder.chatIds.includes(chat.id)
          ? folder.chatIds.filter((id) => id !== chat.id)
          : [...folder.chatIds, chat.id];
        return api.patch(`/folders/${folder.id}`, { chatIds });
      }),
  };
}
