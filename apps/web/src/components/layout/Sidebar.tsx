import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useChatsStore } from '../../stores/chats.store';
import { useI18n } from '../../hooks/useI18n';
import { useThemeStore } from '../../stores/theme.store';
import { Tooltip } from '../ui/Tooltip';
import { Avatar } from '../ui/Avatar';
import { useResizableWidth } from '../../hooks/useResizableWidth';

interface SidebarProps {
  user: any;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const icon = (children: ReactNode) => (
  <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ICONS = {
  chats: icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  search: icon(
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>,
  ),
  contacts: icon(
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>,
  ),
  settings: icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
  ),
  admin: icon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />),
  logout: icon(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>,
  ),
  sun: icon(
    <>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </>,
  ),
  moon: icon(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />),
};

/** One entry of the sidebar: an accent chip with the icon, then the label (and an unread badge). */
function NavItem({
  to,
  label,
  hint,
  glyph,
  badge,
  onClick,
}: {
  to: string;
  label: string;
  hint: string;
  glyph: ReactNode;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <Tooltip label={hint} side="right">
      <NavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) =>
          clsx(
            'group relative flex items-center gap-3.5 px-3.5 py-3 text-[15px] font-medium rounded-2xl transition-colors duration-150',
            isActive ? 'bg-fg-accent/10 text-fg-accent' : 'text-fg-secondary hover:bg-bg-hover hover:text-fg-primary',
          )
        }
      >
        <span className="w-7 h-7 rounded-lg bg-fg-accent/10 text-fg-accent flex items-center justify-center flex-shrink-0 [&_svg]:w-4 [&_svg]:h-4">{glyph}</span>
        <span className="leading-none">{label}</span>
        {badge ? <span className="ml-auto bg-fg-accent text-fg-on-accent text-xs px-2 py-0.5 rounded-full">{badge}</span> : null}
      </NavLink>
    </Tooltip>
  );
}

export function Sidebar({ user, onLogout, isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const chats = useChatsStore((s) => s.chats);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const side = useResizableWidth('flux-sidebar-width', 256, 200, 340);
  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  // Quick theme toggle: light ⇄ dark, "system" falls back to light.
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-bg-overlay backdrop-blur-[2px] z-30 animate-fade-in md:hidden" onClick={onClose} />}
      <aside
        className={clsx(
          'fixed md:relative inset-y-0 left-0 z-40 w-64 md:w-[var(--side-w)] flex flex-col flex-shrink-0',
          'bg-bg-panel/80 backdrop-blur-xl backdrop-saturate-150 border-r border-border-subtle',
          'transition-transform duration-300 ease-spring',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{ ['--side-w' as string]: `${side.width}px` }}
      >
        <div
          {...side.handleProps}
          role="separator"
          aria-orientation="vertical"
          title="Потяните, чтобы изменить ширину"
          className="hidden md:block absolute top-0 -right-1 h-full w-2 z-20 cursor-col-resize hover:bg-fg-accent/30 active:bg-fg-accent/50 transition-colors"
        />
        <div className="px-4 py-5 flex items-center gap-2">
          <button
            onClick={() => user?.id && navigate(`/u/${user.id}`)}
            className="flex-1 min-w-0 flex items-center gap-3 rounded-xl text-left p-1.5 -m-1.5 transition-colors hover:bg-bg-hover"
            aria-label={t('profile.myProfile')}
          >
            <Avatar name={`${user?.firstName || ''} ${user?.lastName || ''}`} avatarUrl={user?.avatarUrl} size="md" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-fg-primary truncate">
                {user?.firstName} {user?.lastName || ''}
              </div>
              <div className="text-xs text-fg-secondary truncate">@{user?.username || 'no-username'}</div>
            </div>
          </button>
          <Tooltip label={t('nav.themeHint')} side="bottom">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="p-2 rounded-full flex-shrink-0 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary transition-colors duration-200"
              aria-label={t('settings.theme')}
            >
              {isDark ? ICONS.sun : ICONS.moon}
            </button>
          </Tooltip>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          <NavItem to="/chats" label={t('nav.chats')} hint={t('nav.chatsHint')} glyph={ICONS.chats} badge={totalUnread} onClick={onClose} />
          <NavItem to="/search" label={t('nav.search')} hint={t('nav.searchHint')} glyph={ICONS.search} onClick={onClose} />
          <NavItem to="/contacts" label={t('nav.contacts')} hint={t('nav.contactsHint')} glyph={ICONS.contacts} onClick={onClose} />
          <NavItem to="/settings" label={t('nav.settings')} hint={t('nav.settingsHint')} glyph={ICONS.settings} onClick={onClose} />
          {user?.role === 'ADMIN' && (
            <NavItem to="/admin" label={t('nav.admin')} hint={t('nav.adminHint')} glyph={ICONS.admin} onClick={onClose} />
          )}
        </nav>

        <div className="p-3 border-t border-border-subtle">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-panel border border-transparent text-sm font-medium text-fg-secondary transition-all duration-200 ease-spring hover:bg-fg-error/10 hover:border-fg-error/30 hover:text-fg-error"
          >
            <span className="w-7 h-7 rounded-lg bg-fg-accent/10 text-fg-accent flex items-center justify-center flex-shrink-0 [&_svg]:w-4 [&_svg]:h-4">
              {ICONS.logout}
            </span>
            <span className="leading-none">{t('nav.logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
