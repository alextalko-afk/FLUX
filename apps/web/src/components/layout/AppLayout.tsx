import { useEffect } from 'react';
import { useChatsStore } from '../../stores/chats.store';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useUiStore } from '../../stores/ui.store';
import { Sidebar } from './Sidebar';
import { CallManager } from '../../features/calls/components/CallManager';
import { GroupCallManager } from '../../features/calls/components/GroupCallControls';

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useUiStore();

  // Desktop app: show the unread total on the taskbar icon (muted chats do not count).
  const unreadTotal = useChatsStore((st) => st.chats.reduce((sum, c) => sum + (c.isMuted ? 0 : c.unreadCount), 0));
  useEffect(() => {
    window.electronAPI?.setBadge?.(unreadTotal);
  }, [unreadTotal]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // `/chats` renders its own two-pane layout; every other route (including
  // `/chats/:id/info`, which must not be squeezed next to the chat list)
  // gets a scrollable single-pane wrapper.
  const isChats =
    location.pathname.startsWith('/chats') && !location.pathname.endsWith('/info');

  return (
    // Floating app shell: the panes sit inside a rounded, inset "device"
    // instead of bleeding into the window edges, which is what makes the
    // layout read as designed rather than as raw divs.
    <div className="h-screen w-full flex bg-bg-app overflow-hidden">
      <div className="hidden md:flex flex-1 p-3 lg:p-4 min-w-0 app-shell-parent">
        <div className="app-shell flex flex-1 min-w-0 overflow-hidden">
          <Sidebar
            user={user}
            onLogout={handleLogout}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          <main className="flex-1 flex min-w-0 overflow-hidden">
            {isChats ? (
              <Outlet />
            ) : (
              <div
                key={location.pathname}
                className="flex-1 overflow-auto flex flex-col animate-fade-in"
              >
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* On phones the shell is full-bleed: padding would waste scarce space. */}
      <div className="md:hidden flex-1 flex min-w-0">
        <div className="app-shell app-shell-flush flex flex-1 min-w-0 overflow-hidden">
          <Sidebar
            user={user}
            onLogout={handleLogout}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          <main className="flex-1 flex min-w-0 overflow-hidden">
            {isChats ? (
              <Outlet />
            ) : (
              <div
                key={location.pathname}
                className="flex-1 overflow-auto flex flex-col animate-fade-in"
              >
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Handles incoming call modals and the active call screen globally. */}
      <CallManager />
      <GroupCallManager />
    </div>
  );
}
