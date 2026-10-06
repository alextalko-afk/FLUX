import { KeyboardEvent, ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Segment,
  TextEntity,
  segmentize,
  toSafeUrl,
  withAutoEntities,
} from '../../../lib/richText';

interface RichTextProps {
  content: string;
  entities?: TextEntity[] | null;
  /**
   * Skip bare-URL / @mention / #hashtag detection. Used for text that is not
   * the sender's own words, such as the placeholder shown for undecryptable
   * messages.
   */
  plain?: boolean;
}

/**
 * Renders message text with its formatting.
 *
 * Everything is built from React elements, never from an HTML string, so text
 * can not inject markup. Links are re-checked here even though the server
 * validated them: an unsafe URL is shown as plain text instead of an anchor.
 */
export function RichText({ content, entities, plain }: RichTextProps) {
  const [revealed, setRevealed] = useState<ReadonlySet<TextEntity>>(new Set());

  const segments = useMemo(
    () => segmentize(content, plain ? [] : withAutoEntities(content, entities ?? [])),
    [content, entities, plain],
  );

  const reveal = (entity: TextEntity) => setRevealed((current) => new Set(current).add(entity));

  return (
    <>
      {segments.map((segment, index) => (
        <StyledRun
          key={index}
          content={content}
          segment={segment}
          revealed={revealed}
          onReveal={reveal}
        />
      ))}
    </>
  );
}

function StyledRun({
  content,
  segment,
  revealed,
  onReveal,
}: {
  content: string;
  segment: Segment;
  revealed: ReadonlySet<TextEntity>;
  onReveal: (entity: TextEntity) => void;
}) {
  // Wrap from the innermost style outwards, so the outermost entity ends up
  // on the outside.
  let node: ReactNode = segment.text;

  for (const entity of [...segment.styles].reverse()) {
    node = wrap(entity, node, content, revealed, onReveal);
  }

  return <>{node}</>;
}

function wrap(
  entity: TextEntity,
  children: ReactNode,
  content: string,
  revealed: ReadonlySet<TextEntity>,
  onReveal: (entity: TextEntity) => void,
): ReactNode {
  switch (entity.type) {
    case 'bold':
      return <strong className="font-semibold">{children}</strong>;
    case 'italic':
      return <em>{children}</em>;
    case 'strikethrough':
      return <s>{children}</s>;
    case 'code':
      return (
        <code className="px-1 py-0.5 rounded bg-bg-hover font-mono text-[0.9em]">{children}</code>
      );
    case 'pre':
      return (
        <code className="block my-1 px-2 py-1.5 rounded bg-bg-hover font-mono text-[0.9em] whitespace-pre-wrap">
          {children}
        </code>
      );
    case 'spoiler': {
      const isRevealed = revealed.has(entity);
      const onKey = (event: KeyboardEvent<HTMLSpanElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onReveal(entity);
        }
      };
      return (
        <span
          role={isRevealed ? undefined : 'button'}
          tabIndex={isRevealed ? undefined : 0}
          aria-label={isRevealed ? undefined : 'Spoiler'}
          onClick={isRevealed ? undefined : () => onReveal(entity)}
          onKeyDown={isRevealed ? undefined : onKey}
          className={clsx(
            'rounded px-0.5 transition-colors',
            isRevealed
              ? 'bg-bg-hover'
              : 'bg-fg-secondary text-transparent cursor-pointer select-none hover:bg-fg-primary',
          )}
        >
          {children}
        </span>
      );
    }
    case 'link': {
      const href = entity.url ? toSafeUrl(entity.url) : null;
      if (!href) return children;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-fg-link underline underline-offset-2 hover:opacity-80 break-all"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </a>
      );
    }
    case 'mention':
    case 'hashtag':
      return (
        <Link
          to={`/search?q=${encodeURIComponent(content.slice(entity.offset, entity.offset + entity.length))}`}
          className="text-fg-link hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </Link>
      );
    default:
      return children;
  }
}
