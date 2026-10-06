import { InputHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Text field with a bound label.
 *
 * The `id` is generated with `useId` so it is unique per instance and stable
 * across re-renders. Deriving it from the label text (as an earlier version
 * did) produced ids that changed with the active locale and collided whenever
 * the same label appeared twice on a page, which silently broke the
 * label/control association for screen readers.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-fg-primary mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          // Announce validation state to assistive tech, not just visually.
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? errorId : hint ? hintId : undefined
          }
          className={clsx(
            // Slightly raised surface + a ring on focus reads as a real control
            // rather than a flat rectangle drawn on the page.
            'w-full px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-tertiary',
            'bg-bg-elevated rounded-xl border shadow-panel transition-all duration-200 ease-spring',
            'hover:border-fg-accent/30',
            'focus:outline-none focus:border-fg-accent/60 focus:ring-4 focus:ring-fg-accent/10 focus:shadow-card',
            error ? 'border-fg-error focus:ring-fg-error/12' : 'border-border',
            className,
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-fg-error">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="mt-1 text-xs text-fg-secondary">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';