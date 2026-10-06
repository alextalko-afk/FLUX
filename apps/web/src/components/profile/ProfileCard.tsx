import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useI18n } from '../../hooks/useI18n';

/** Small line icons shared by the profile rows and action buttons. */
export const ICON = {
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  bellOff: 'M13.7 21a2 2 0 0 1-3.4 0M18 8a6 6 0 0 0-9.3-5M6 6a6 6 0 0 0 0 2c0 7-3 9-3 9h14M1 1l22 22',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  video: 'M23 7l-7 5 7 5zM3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  mic: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4',
  users: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  userPlus: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6',
  userMinus: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 11h-6',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  block: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  lock: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
  close: 'M18 6L6 18M6 6l12 12',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  chevron: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
};

export function Icon({ path, className = 'w-[22px] h-[22px]' }: { path: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export interface MenuItem {
  label: string;
  path: string;
  onClick: () => void;
  danger?: boolean;
}

export interface ProfileAction {
  label: string;
  path: string;
  /** Not needed when `menu` is given: the button then opens that menu. */
  onClick?: () => void;
  menu?: MenuItem[];
  disabled?: boolean;
  danger?: boolean;
}

/** One action button; with `menu` it opens a dropdown under itself, closed by a click anywhere else. */
function ActionButton({ action }: { action: ProfileAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative h-full">
      <button
        onClick={() => (action.menu ? setOpen((v) => !v) : action.onClick?.())}
        disabled={action.disabled}
        aria-haspopup={action.menu ? 'menu' : undefined}
        aria-expanded={action.menu ? open : undefined}
        className={clsx(
          'w-full h-full min-h-[76px] flex flex-col items-center justify-center gap-2 py-3 rounded-2xl bg-bg-panel border border-border shadow-panel text-[12.5px] font-semibold transition-all active:scale-[0.97] disabled:opacity-50',
          action.danger ? 'text-fg-error hover:bg-fg-error/10' : 'text-fg-primary hover:bg-bg-hover',
        )}
      >
        <Icon path={action.path} />
        <span className="leading-tight px-1.5 text-center">{action.label}</span>
      </button>
      {open && action.menu && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-30 w-64 py-1.5 rounded-xl bg-bg-panel ring-1 ring-border shadow-dropdown text-left animate-scale-in origin-top-right">
          {action.menu.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={clsx('w-full flex items-center gap-4 px-4 py-2.5 text-[14.5px] font-medium hover:bg-bg-hover transition-colors', item.danger ? 'text-fg-error' : 'text-fg-primary')}
            >
              <span className={item.danger ? '' : 'text-fg-secondary'}>
                <Icon path={item.path} />
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ProfileCardProps {
  onClose: () => void;
  avatar: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ProfileAction[];
  children?: ReactNode;
}

/**
 * The profile window used for people, groups and channels: a centred card over the app with the
 * avatar and name on top, a row of actions, and then plain sections of icon rows.
 */
export function ProfileCard({ onClose, avatar, title, subtitle, actions = [], children }: ProfileCardProps) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-[420px] max-w-full max-h-[92vh] overflow-y-auto rounded-2xl bg-bg-panel shadow-dropdown ring-1 ring-border animate-scale-in">
        <div className="relative bg-bg-elevated px-5 pt-8 pb-5 text-center">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-fg-secondary hover:bg-bg-hover hover:text-fg-primary transition-colors"
            aria-label={t('common.close')}
          >
            <Icon path={ICON.close} />
          </button>
          <div className="flex justify-center">{avatar}</div>
          <h2 className="mt-4 text-[20px] leading-6 font-bold tracking-tight text-fg-primary break-words">{title}</h2>
          {subtitle && <div className="text-[14px] text-fg-secondary mt-1">{subtitle}</div>}

          {actions.length > 0 && (
            <div className="mt-5 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
              {actions.map((a) => (
                <ActionButton key={a.label} action={a} />
              ))}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** A block of rows, separated from its neighbours by a thick band like the profile windows of desktop messengers. */
export function ProfileSection({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t-[10px] border-bg-app py-2">
      {title && <h3 className="px-6 pt-2 pb-1.5 text-xs font-bold text-fg-secondary uppercase tracking-[0.12em]">{title}</h3>}
      {children}
    </section>
  );
}

export function ProfileRow({
  path,
  label,
  caption,
  value,
  onClick,
  tone,
  action,
}: {
  path: string;
  label: ReactNode;
  caption?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  tone?: 'danger' | 'success';
  action?: { text: string; onClick: () => void };
}) {
  const body = (
    <>
      <span className={clsx('flex-shrink-0 mt-0.5', tone === 'danger' ? 'text-fg-error' : tone === 'success' ? 'text-fg-success' : 'text-fg-secondary')}>
        <Icon path={path} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={clsx('block text-[15.5px] leading-snug font-medium break-words whitespace-pre-wrap', tone === 'danger' ? 'text-fg-error' : 'text-fg-primary')}>{label}</span>
        {caption && <span className="block text-[13px] text-fg-secondary mt-0.5">{caption}</span>}
      </span>
      {value !== undefined && <span className="text-[15px] text-fg-secondary tabular-nums flex-shrink-0">{value}</span>}
    </>
  );
  const cls = 'w-full flex items-start gap-5 px-6 py-3 transition-colors';
  return (
    <div className="flex items-start">
      {onClick ? (
        <button onClick={onClick} className={clsx(cls, 'hover:bg-bg-hover')}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {action && (
        <button onClick={action.onClick} className="text-xs font-medium text-fg-accent hover:underline flex-shrink-0 pr-5 pt-3.5">
          {action.text}
        </button>
      )}
    </div>
  );
}
