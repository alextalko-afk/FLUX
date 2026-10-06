import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Accessible id of the panel controlled by this tab list. */
  ariaLabel?: string;
}

/**
 * Segmented tab bar with a single indicator that slides between items.
 *
 * The indicator is positioned from measured DOM rects, so it stays correct
 * with any label width or font — no magic numbers per breakpoint.
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Measure after paint so fonts/layout settle before the indicator moves.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const update = () => {
      const active = list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(value)}"]`);
      if (!active) {
        setIndicator((prev) => (prev === null ? prev : null));
        return;
      }

      const left = active.offsetLeft;
      const width = active.offsetWidth;

      // `items` is a fresh array on every render, so guard the state update:
      // without this the effect would loop forever.
      setIndicator((prev) =>
        prev && prev.left === left && prev.width === width ? prev : { left, width },
      );
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, items]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        'relative inline-flex items-center gap-1 p-1 bg-bg-sunken border border-border rounded-xl shadow-inner',
        className,
      )}
    >
      {indicator && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-lg bg-gradient-to-b from-fg-accent to-fg-accent/90 shadow-accent transition-all duration-300 ease-spring"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}

      {items.map((item) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab-id={item.id}
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={clsx(
              'relative z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap',
              'transition-colors duration-200 ease-spring',
              isActive
                ? 'text-fg-inverse'
                : 'text-fg-secondary hover:text-fg-primary',
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}