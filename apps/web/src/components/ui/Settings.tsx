import { ReactNode } from 'react';
import clsx from 'clsx';
import { Tooltip } from './Tooltip';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  /** Accessible name when the surrounding row already shows the label. */
  ariaLabel?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  ariaLabel,
  description,
  disabled,
  className,
}: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative w-11 h-6 rounded-full flex-shrink-0 transition-all duration-300 ease-spring',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent focus-visible:ring-offset-2',
        'focus-visible:ring-offset-bg-panel',
        checked ? 'bg-fg-accent shadow-accent' : 'bg-bg-active',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:brightness-105',
        className,
      )}
    >
      <span
        className={clsx(
          'absolute left-0 top-0.5 w-5 h-5 rounded-full bg-white shadow-sm',
          'transition-transform duration-300 ease-spring',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );

  if (!label) return control;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg-primary">{label}</div>
        {description && (
          <div className="text-xs text-fg-secondary mt-0.5">{description}</div>
        )}
      </div>
      {control}
    </div>
  );
}

interface SettingsRowProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Card row used across settings sections for a consistent, scannable layout.
 *
 * When `description` is set, hovering (or focusing) the title reveals it as a
 * tooltip as well, so the hint is available without extra layout noise.
 */
export function SettingsRow({
  icon,
  title,
  description,
  children,
  className,
}: SettingsRowProps) {
  return (
    <div
      className={clsx(
        'group/row flex items-center gap-4 p-4 bg-bg-elevated border border-border rounded-panel shadow-panel',
        'transition-all duration-200 ease-spring',
        'hover:border-fg-accent/40 hover:-translate-y-0.5 hover:shadow-float',
        className,
      )}
    >
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-bg-hover text-fg-secondary flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover/row:text-fg-accent group-hover/row:bg-fg-accent/10">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {description ? (
          <Tooltip label={description} side="top">
            <div className="text-sm font-medium text-fg-primary cursor-help w-fit border-b border-dashed border-fg-tertiary/50">
              {title}
            </div>
          </Tooltip>
        ) : (
          <div className="text-sm font-medium text-fg-primary">{title}</div>
        )}
        {description && (
          <div className="text-xs text-fg-secondary mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

interface SectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Titled block that groups related rows inside a settings section. */
export function SettingsSection({ title, description, children, className }: SectionProps) {
  return (
    <section className={clsx('space-y-3', className)}>
      {(title || description) && (
        <header className="px-1">
          {title && (
            <h2 className="text-sm font-semibold text-fg-primary uppercase tracking-wide">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-xs text-fg-secondary mt-1">{description}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}