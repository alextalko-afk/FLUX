import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          'inline-flex items-center justify-center font-semibold rounded-xl relative overflow-hidden',
          'transition-all duration-200 ease-spring',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app',
          'active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          {
            // A vertical gradient plus a glow lifts primary actions off the page.
            'text-fg-on-accent bg-gradient-to-b from-fg-accent to-fg-accent/90 shadow-accent hover:shadow-float hover:-translate-y-0.5 active:translate-y-0':
              variant === 'primary',
            'bg-bg-elevated text-fg-primary border border-border shadow-panel hover:bg-bg-hover hover:border-fg-accent/40 hover:-translate-y-0.5':
              variant === 'secondary',
            'text-fg-secondary hover:bg-bg-hover hover:text-fg-primary': variant === 'ghost',
            'text-white bg-fg-error shadow-card hover:brightness-110 hover:-translate-y-0.5':
              variant === 'danger',
          },
          {
            'px-3 py-1.5 text-[13px] rounded-lg': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-5 py-2.5 text-[15px]': size === 'lg',
          },
          className,
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
