import { useAuthStore } from '../../../stores/auth.store';
import { useChatsStore } from '../../../stores/chats.store';

/**
 * Whether the signed-in user may pin messages in a chat. It mirrors the
 * server's rule: anyone in a private, saved or secret chat, but only the owner
 * and administrators in a group or channel. The server is still the authority;
 * this only decides whether to offer the action.
 */
export function useCanPin(chatId: string): boolean {
  const userId = useAuthStore((state) => state.user?.id);
  const chat = useChatsStore((state) => state.chats.find((item) => item.id === chatId));

  if (!chat || !userId) return false;
  if (chat.type !== 'GROUP' && chat.type !== 'CHANNEL') return true;

  const role = (chat.members as Array<{ userId: string; role?: string }>).find(
    (member) => member.userId === userId,
  )?.role;
  return role === 'OWNER' || role === 'ADMIN';
}
