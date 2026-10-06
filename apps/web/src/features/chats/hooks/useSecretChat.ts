import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../stores/auth.store';
import { getSecretChat, type SecretState } from '../../../services/e2ee/secretSessions';

export type SecretChatStatus = SecretState | { status: 'loading' };

/**
 * State of a secret chat on this device: whether its keys are here, the safety
 * number to verify, and whether the chat can still be used. Only does anything
 * when `enabled`, so ordinary chats pay nothing for it.
 */
export function useSecretChat(chatId: string, enabled: boolean): SecretChatStatus {
  const myId = useAuthStore((state) => state.user?.id);
  const [state, setState] = useState<SecretChatStatus>({ status: 'loading' });

  useEffect(() => {
    if (!enabled || !myId) return;

    let cancelled = false;
    setState({ status: 'loading' });
    void getSecretChat(chatId, myId).then((loaded) => {
      if (!cancelled) setState(loaded.state);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, enabled, myId]);

  return state;
}
