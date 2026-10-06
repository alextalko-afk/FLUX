import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useI18n } from '../../hooks/useI18n';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Portalled so `position: fixed` is relative to the viewport even when an
  // ancestor (e.g. the composer) has a transform or backdrop filter.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-bg-overlay backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative bg-bg-panel rounded-panel shadow-dropdown w-full animate-scale-in max-h-[90vh] overflow-hidden flex flex-col',
          {
            'max-w-sm': size === 'sm',
            'max-w-md': size === 'md',
            'max-w-2xl': size === 'lg',
          },
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-fg-primary">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-fg-secondary hover:bg-bg-hover hover:text-fg-primary transition-colors"
              aria-label={t('common.close')}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
