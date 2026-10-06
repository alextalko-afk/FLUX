import { useEffect, useRef } from 'react';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { Tooltip } from '../../../components/ui/Tooltip';

interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  /** Extra explanation revealed on hover. */
  hint?: string;
}

interface MessageContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function MessageContextMenu({ x, y, items, onClose }: MessageContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const menuWidth = 200;
  const menuHeight = items.length * 40;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const adjustedX = x + menuWidth > viewportWidth ? viewportWidth - menuWidth - 10 : x;
  const adjustedY = y + menuHeight > viewportHeight ? viewportHeight - menuHeight - 10 : y;

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-bg-panel border border-border rounded-xl shadow-dropdown py-1 animate-scale-in origin-top-left"
      style={{
        left: adjustedX,
        top: adjustedY,
        minWidth: menuWidth,
      }}
    >
      {items.map((item, idx) => {
        const button = (
          <button
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`group w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-all duration-150 hover:translate-x-0.5 ${
              item.danger
                ? 'text-fg-error hover:bg-bg-hover hover:text-fg-error'
                : 'text-fg-primary hover:bg-bg-hover'
            }`}
          >
            {item.icon && (
              <span className="w-4 h-4 opacity-70 transition-opacity group-hover:opacity-100">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </button>
        );

        return (
          <div key={idx} className="w-full">
            {item.hint ? (
              <Tooltip label={item.hint} side="right" bubbleClassName="whitespace-normal">
                <div className="w-full">{button}</div>
              </Tooltip>
            ) : (
              button
            )}
          </div>
        );
      })}
    </div>
  );
}
