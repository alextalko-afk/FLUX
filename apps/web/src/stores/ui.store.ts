import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

/**
 * Shell-level UI state (responsive drawer, settings overlay).
 *
 * Message-level menus are intentionally *not* here: `MessageBubble` owns its
 * own popover position so a right-click menu opens next to the bubble and
 * closes with it, rather than being global state shared by every list.
 */
export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  settingsOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));