import type { RefObject } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { MessageBubble } from './MessageBubble';
import { useI18n } from '../../../hooks/useI18n';
import { formatDaySeparator, isDifferentDay } from '../../../lib/format';

/**
 * Virtuoso needs a `firstItemIndex` that shrinks as older messages are
 * prepended, so the list can keep the reader's scroll position. Starting from a
 * large number leaves room for the history of any realistic chat.
 */
export const START_INDEX = 1_000_000;

interface MessageListV2Props {
  messages: any[];
  currentUserId: string;
  chatId: string;
  onReply?: (message: any) => void;
  /** `START_INDEX` minus the number of messages prepended so far. */
  firstItemIndex: number;
  /** More history exists on the server than what is loaded. */
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  onAtBottomChange: (atBottom: boolean) => void;
  listRef: RefObject<VirtuosoHandle>;
}

/**
 * The conversation, rendered virtually: only the bubbles near the viewport
 * exist in the DOM, so a chat with tens of thousands of messages scrolls as
 * smoothly as one with ten. Scrolling to the top loads the next page of history.
 */
export function MessageListV2({
  messages,
  currentUserId,
  chatId,
  onReply,
  firstItemIndex,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  onAtBottomChange,
  listRef,
}: MessageListV2Props) {
  const { t, locale } = useI18n();

  return (
    <Virtuoso
      // A new chat gets a fresh list, so it opens at its newest message and
      // never inherits the previous chat's scroll position.
      key={chatId}
      ref={listRef}
      style={{ height: '100%' }}
      data={messages}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
      computeItemKey={(_, message) => message.id}
      // Follow new messages only while the reader is already at the bottom.
      followOutput={(atBottom) => (atBottom ? 'smooth' : false)}
      atBottomThreshold={120}
      atBottomStateChange={onAtBottomChange}
      startReached={() => {
        if (hasMoreOlder && !isLoadingOlder) onLoadOlder();
      }}
      increaseViewportBy={{ top: 600, bottom: 400 }}
      components={{
        Header: () => (
          <div className="h-8 flex items-center justify-center text-xs text-fg-tertiary" aria-live="polite">
            {isLoadingOlder ? t('common.loading') : null}
          </div>
        ),
        Footer: () => <div className="h-3" />,
      }}
      itemContent={(index, message) => {
        const i = index - firstItemIndex;
        const previous = messages[i - 1];
        const next = messages[i + 1];
        const isOwn = message.senderId === currentUserId;
        const showAvatar = !isOwn && (!previous || previous.senderId !== message.senderId);
        // Only the final bubble of a run keeps the tail, so a burst of
        // messages from one person reads as a single group.
        const isLastInGroup = !next || next.senderId !== message.senderId;

        const createdAt = new Date(message.createdAt);
        const showDaySeparator = !previous || isDifferentDay(new Date(previous.createdAt), createdAt);

        return (
          <div className="px-4 pb-1">
            {showDaySeparator && (
              <div className="flex justify-center py-2 pointer-events-none">
                <span className="text-2xs font-medium text-fg-secondary bg-bg-panel/90 backdrop-blur border border-border rounded-full px-3 py-1 shadow-panel">
                  {formatDaySeparator(createdAt, locale)}
                </span>
              </div>
            )}
            <MessageBubble
              message={message}
              isOwn={isOwn}
              showAvatar={showAvatar}
              isLastInGroup={isLastInGroup}
              chatId={chatId}
              onReply={onReply}
            />
          </div>
        );
      }}
    />
  );
}
