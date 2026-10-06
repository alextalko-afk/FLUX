import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../stores/auth.store';
import { getGroupChat, refreshGroupChat, type GroupE2eeStatus } from '../../../services/e2ee/groupSessions';

const POLL_MS = 15_000;

/**
 * State of an end-to-end encrypted group on this device. While the key has not
 * arrived (an administrator has to be online to hand it over) it asks again
 * every few seconds. Only does anything when `enabled`.
 */
export function useGroupE2ee(chatId: string, enabled: boolean): GroupE2eeStatus | 'loading' {
  const myId = useAuthStore((state) => state.user?.id);
  const [status, setStatus] = useState<GroupE2eeStatus | 'loading'>('loading');

  useEffect(() => {
    if (!enabled || !myId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async (first: boolean) => {
      const loaded = await (first ? getGroupChat(chatId, myId) : refreshGroupChat(chatId, myId));
      if (cancelled) return;
      setStatus(loaded.status);
      if (loaded.status === 'waiting') timer = setTimeout(() => void run(false), POLL_MS);
    };
    setStatus('loading');
    void run(true);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [chatId, enabled, myId]);

  return status;
}
