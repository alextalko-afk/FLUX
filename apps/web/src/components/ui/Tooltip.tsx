import { ReactNode, cloneElement, isValidElement, useId, useState } from 'react';
import clsx from 'clsx';

type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** The hint shown on hover and on keyboard focus. */
  label: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
  /** Extra classes for the floating bubble itself. */
  bubbleClassName?: string;
}

const POSITION: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const ARROW: Record<TooltipSide, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 -mt-1',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1',
  left: 'left-full top-1/2 -translate-y-2/3 -ml-1',
  right: 'right-full top-1/2 -translate-y-2/3 -mr-1',
};

/**
 * Hover / focus hint for controls whose meaning is not obvious from the icon.
 *
 * The bubble is positioned against the trigger itself. When the trigger is a
 * single element the handlers and the `relative` positioning are merged into
 * it with `cloneElement` — an extra wrapper `<span>` would silently change the
 * layout of flex rows (that is how long chat previews ended up overflowing).
 * Plain text children still get a minimal inline wrapper.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  className,
  bubbleClassName,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const handlers = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  };

  const bubble = open ? (
    <span
      role="tooltip"
      id={id}
      className={clsx(
        'pointer-events-none absolute z-50 whitespace-nowrap',
        'px-2.5 py-1.5 rounded-lg max-w-xs',
        'bg-bg-panel text-fg-primary text-xs font-medium leading-snug',
        'border border-border shadow-dropdown',
        'animate-fade-in',
        POSITION[side],
        bubbleClassName,
      )}
    >
      {label}
      <span
        aria-hidden
        className={clsx(
          'absolute w-2 h-2 rotate-45 bg-bg-panel border border-border',
          ARROW[side],
        )}
      />
    </span>
  ) : null;

  if (isValidElement(children)) {
    const child = children as React.ReactElement<{
      className?: unknown;
      style?: unknown;
      onMouseEnter?: unknown;
      onMouseLeave?: unknown;
      onFocus?: unknown;
      onBlur?: unknown;
      'aria-describedby'?: string;
    }>;
    const childProps = child.props as {
      children?: ReactNode;
      className?: string;
      style?: Record<string, unknown>;
      onMouseEnter?: unknown;
      onMouseLeave?: unknown;
      onFocus?: unknown;
      onBlur?: unknown;
      'aria-describedby'?: string;
    };

    // `NavLink` and friends take a *function* as className. Merging into it
    // with `clsx` would drop it entirely and leave the trigger unstyled, so
    // only a plain string is merged; positioning is set through `style`.
    const classNameOverride =
      typeof childProps.className === 'string'
        ? clsx(childProps.className, className)
        : childProps.className ?? className;

    // Chain rather than overwrite so the trigger keeps its own handlers.
    return cloneElement(child, {
      className: classNameOverride,
      style: { ...(childProps.style ?? {}), position: 'relative' },
      onMouseEnter: (e: unknown) => {
        (childProps.onMouseEnter as ((e: unknown) => void) | undefined)?.(e);
        handlers.onMouseEnter();
      },
      onMouseLeave: (e: unknown) => {
        (childProps.onMouseLeave as ((e: unknown) => void) | undefined)?.(e);
        handlers.onMouseLeave();
      },
      onFocus: (e: unknown) => {
        (childProps.onFocus as ((e: unknown) => void) | undefined)?.(e);
        handlers.onFocus();
      },
      onBlur: (e: unknown) => {
        (childProps.onBlur as ((e: unknown) => void) | undefined)?.(e);
        handlers.onBlur();
      },
      'aria-describedby': open ? id : childProps['aria-describedby'],
      children: (
        <>
          {childProps.children}
          {bubble}
        </>
      ),
    } as never);
  }

  return (
    <span
      className={clsx('relative inline-flex', className)}
      {...handlers}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {bubble}
    </span>
  );
}