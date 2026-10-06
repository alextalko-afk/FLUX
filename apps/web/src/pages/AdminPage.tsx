import { NavLink, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { AdminDashboard } from '../features/admin/components/AdminDashboard';
import { AdminUsers } from '../features/admin/components/AdminUsers';
import { AdminReports } from '../features/admin/components/AdminReports';
import { AdminBots } from '../features/admin/components/AdminBots';
import { AdminChats } from '../features/admin/components/AdminChats';
import { AdminAuditLog } from '../features/admin/components/AdminAuditLog';
import { AdminSystem } from '../features/admin/components/AdminSystem';
import { useI18n } from '../hooks/useI18n';

const SECTION_IDS = [
  'dashboard',
  'users',
  'chats',
  'reports',
  'bots',
  'audit',
  'system',
] as const;

type AdminSection = (typeof SECTION_IDS)[number];

const ICONS: Record<AdminSection, string> = {
  dashboard:
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  users:
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  chats:
    'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  reports:
    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  bots: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  system:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  audit:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
};

export function AdminPage() {
  const { section } = useParams();
  const { t } = useI18n();
  const activeSection = (section || 'dashboard') as AdminSection;

  const sections: { id: AdminSection; label: string }[] = SECTION_IDS.map((id) => ({
    id,
    label: t(`admin.${id}`),
  }));

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-border bg-bg-panel p-2">
        <div className="px-3 py-2 mb-2">
          <h2 className="text-lg font-semibold text-fg-primary">{t('admin.title')}</h2>
          <p className="text-xs text-fg-secondary mt-1">{t('admin.subtitle')}</p>
        </div>
        <nav className="space-y-1">
          {sections.map((s) => (
            <NavLink
              key={s.id}
              to={`/admin/${s.id}`}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ease-spring',
                  isActive
                    ? 'bg-bg-active text-fg-primary shadow-panel'
                    : 'text-fg-secondary hover:bg-bg-hover hover:text-fg-primary hover:translate-x-0.5',
                )
              }
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={ICONS[s.id]} />
              </svg>
              <span>{s.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'dashboard' && <AdminDashboard />}
        {activeSection === 'users' && <AdminUsers />}
        {activeSection === 'chats' && <AdminChats />}
        {activeSection === 'reports' && <AdminReports />}
        {activeSection === 'bots' && <AdminBots />}
        {activeSection === 'audit' && <AdminAuditLog />}
        {activeSection === 'system' && <AdminSystem />}
      </div>
    </div>
  );
}
