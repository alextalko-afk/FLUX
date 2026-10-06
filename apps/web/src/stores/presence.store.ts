import { create } from 'zustand';

interface PresenceState {
  onlineUsers: Set<string>;
  handlePresence: (payload: { userId: string }) => void;
  isOnline: (userId: string) => boolean;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: new Set(),

  handlePresence: (payload) => {
    const { userId } = payload;
    const current = new Set(get().onlineUsers);
    if (current.has(userId)) {
      current.delete(userId);
    } else {
      current.add(userId);
    }
    set({ onlineUsers: current });
  },

  isOnline: (userId) => get().onlineUsers.has(userId),

  reset: () => set({ onlineUsers: new Set() }),
}));
