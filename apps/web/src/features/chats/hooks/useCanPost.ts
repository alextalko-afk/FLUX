import { useAuthStore } from '../../../stores/auth.store';
import { useChatsStore } from '../../../stores/chats.store';

export type PostBlock = 'channel' | 'restricted' | null;

/**
 * Why the signed-in user cannot write in a chat, mirroring the server rule:
 * only owner and admins post in a channel, and restricted members never do.
 * The server decides; this only keeps a useless input box off the screen.
 */
export function usePostBlock(chatId: string): PostBlock {
  const userId = useAuthStore((state) => state.user?.id);
  const chat = useChatsStore((state) => state.chats.find((item) => item.id === chatId));
  if (!chat || !userId) return null;

  const role = (chat.members as Array<{ userId: string; role?: string }>).find(
    (member) => member.userId === userId,
  )?.role;
  if (role === 'OWNER' || role === 'ADMIN') return null;
  if (role === 'RESTRICTED') return 'restricted';
  return chat.type === 'CHANNEL' ? 'channel' : null;
}
