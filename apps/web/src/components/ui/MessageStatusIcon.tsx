import clsx from 'clsx';

interface MessageStatusIconProps {
  status?: string | null;
  className?: string;
}

/**
 * Delivery state of an outgoing message.
 *
 * `SENDING → SENT → DELIVERED → READ` is shown as one / two ticks, matching the
 * convention users already know from other messengers. `READ` is the only state
 * that gets the accent colour so it stands out at a glance.
 */
export function MessageStatusIcon({ status, className }: MessageStatusIconProps) {
  if (!status) return null;

  const base = 'w-3.5 h-3.5 flex-shrink-0';

  if (status === 'FAILED') {
    return (
      <svg
        className={clsx(base, 'text-fg-error', className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="7" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }

  if (status === 'SENDING') {
    return (
      <svg
        className={clsx(base, 'text-fg-tertiary', className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  if (status === 'SENT') {
    return (
      <svg
        className={clsx(base, 'text-fg-tertiary', className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }

  if (status === 'DELIVERED') {
    return (
      <svg
        className={clsx(base, 'text-fg-secondary', className)}
        viewBox="0 0 26 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="15 6 4 17 -1 12" />
        <polyline points="22 6 11 17 9.5 15.5" />
      </svg>
    );
  }

  if (status === 'READ') {
    return (
      <svg
        className={clsx(base, 'text-fg-accent', className)}
        viewBox="0 0 26 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="15 6 4 17 -1 12" />
        <polyline points="22 6 11 17 9.5 15.5" />
      </svg>
    );
  }

  return null;
}