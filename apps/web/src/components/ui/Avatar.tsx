import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useMediaSrc } from '../../features/media/hooks/useMediaSrc';

/**
 * Gradient pairs used when a person has no uploaded picture.
 * The index is derived from the name, so a given person always gets the
 * same colour instead of flickering between renders.
 */
const GRADIENTS: [string, string][] = [
  ['#FF5252', '#C51162'],
  ['#FF4081', '#F50057'],
  ['#673AB7', '#3D5AFE'],
  ['#536DFE', '#2979FF'],
  ['#00B0FF', '#0091EA'],
  ['#00BFA5', '#1DE9B6'],
  ['#00C853', '#64DD17'],
  ['#FFEA00', '#FFC400'],
  ['#FF6D00', '#FFAB00'],
  ['#00BCD4', '#0097A7'],
];

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-28 h-28 text-4xl',
} as const;

export type AvatarSize = keyof typeof SIZES;

interface AvatarProps {
  /** Used for the initials fallback and to pick a stable gradient. */
  name?: string | null;
  /** Uploaded picture. Falls back to initials if it fails to load. */
  avatarUrl?: string | null;
  size?: AvatarSize;
  /**
   * Overrides the circle's own size classes. Use it whenever the avatar sits
   * in a fixed-size box: otherwise a mismatch (an 80px box around a 112px
   * circle) makes the avatar overflow and overlap its neighbours.
   */
  circleClassName?: string;
  /** Renders a group/channel glyph instead of initials. */
  isGroup?: boolean;
  isChannel?: boolean;
  /** Shows a presence dot in the corner. */
  presence?: string | null;
  className?: string;
}

/** Up to two initials: "Ada Lovelace" -> "AL", "Cher" -> "C". */
function initialsOf(name: string | null | undefined): string {
  const clean = (name || '').trim();
  if (!clean) return '?';

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Always returns a pair, so callers never deal with an undefined entry. */
function gradientOf(name: string | null | undefined): [string, string] {
  const key = (name || '').trim() || '?';
  return GRADIENTS[hashOf(key) % GRADIENTS.length] as [string, string];
}

/**
 * Single source of truth for every avatar in the app.
 *
 * Previously each screen drew its own gradient circle with a first letter, so
 * uploaded pictures from `avatarUrl` were never shown and the same person had
 * a different colour depending on where you met them.
 */
export function Avatar({
  name,
  avatarUrl,
  size = 'md',
  circleClassName,
  isGroup,
  isChannel,
  presence,
  className,
}: AvatarProps) {
  // Reset the "image failed" flag whenever the URL changes, otherwise a new
  // picture would stay hidden after a previous one 404'd.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  // `avatarUrl` stores an authenticated API path, not a public image URL.
  // `<img src>` cannot send the bearer token, so the path is exchanged for a
  // short-lived presigned URL first — the same flow message attachments use.
  const isApiPath = Boolean(avatarUrl?.startsWith('/api/'));
  const { data: resolvedUrl } = useMediaSrc(isApiPath ? avatarUrl : null, isApiPath);
  const source = isApiPath ? (resolvedUrl ?? null) : (avatarUrl ?? null);

  useEffect(() => {
    setBrokenUrl(null);
  }, [source]);

  const gradient = useMemo(() => gradientOf(name), [name]);
  const showImage = Boolean(source) && brokenUrl !== source;

  const isOnline = presence === 'ONLINE';

  return (
    <div className={clsx('relative flex-shrink-0', className)}>
      <div
        className={clsx(
          'flex items-center justify-center overflow-hidden rounded-full font-semibold select-none',
          // Only one size set is applied, so there is no class conflict to
          // resolve. A literal override also stays visible to Tailwind's
          // scanner, which a computed `!important` prefix would not.
          circleClassName ?? SIZES[size],
        )}
        style={
          showImage
            ? undefined
            : { backgroundImage: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }
        }
      >
        {showImage ? (
          <img
            src={source!}
            alt={name || ''}
            loading="lazy"
            onError={() => setBrokenUrl(source!)}
            className="w-full h-full object-cover"
          />
        ) : isGroup || isChannel ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            className="w-1/2 h-1/2"
            aria-hidden
          >
            {isChannel ? (
              <>
                <path d="M3 11v3a1 1 0 0 0 1 1h3l4 4V6L7 10H4a1 1 0 0 0-1 1z" />
                <path d="M16 9a4 4 0 0 1 0 6" />
              </>
            ) : (
              <>
                <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9.5" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              </>
            )}
          </svg>
        ) : (
          <span className="text-white leading-none">{initialsOf(name)}</span>
        )}
      </div>

      {presence && (
        <span
          className={clsx(
            'absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-bg-panel',
            size === 'xl' ? 'w-5 h-5' : size === 'lg' ? 'w-3.5 h-3.5' : 'w-3 h-3',
            isOnline ? 'bg-fg-success' : 'bg-fg-tertiary',
          )}
          aria-label={isOnline ? 'online' : 'offline'}
        />
      )}
    </div>
  );
}
