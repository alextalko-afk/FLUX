import { useEffect, useRef } from 'react';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { useI18n } from '../../../hooks/useI18n';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👎'];

interface ReactionPickerProps {
  x: number;
  y: number;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ x, y, onSelect, onClose }: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useClickOutside(ref, onClose);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const pickerWidth = QUICK_REACTIONS.length * 40 + 20;
  const viewportWidth = window.innerWidth;
  const adjustedX = x + pickerWidth > viewportWidth ? viewportWidth - pickerWidth - 10 : x;

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-bg-panel border border-border rounded-full shadow-dropdown px-2 py-1.5 flex gap-1 animate-pop-in origin-bottom"
      style={{
        left: adjustedX,
        top: y - 50,
      }}
    >
      {QUICK_REACTIONS.map((emoji, idx) => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          style={{ animationDelay: `${idx * 0.03}s` }}
          className="w-8 h-8 flex items-center justify-center text-xl hover:bg-bg-hover rounded-full transition-all duration-150 hover:scale-125 active:scale-95 animate-scale-in"
          aria-label={`${t('messages.react')} ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
