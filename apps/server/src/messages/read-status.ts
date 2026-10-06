import { PrivacyService } from '../privacy/privacy.service';

export interface MessageWithReceipts {
  senderId: string;
  status: string;
  readReceipts?: Array<{ userId: string }>;
}

/**
 * Turns stored read receipts into the delivery status the sender sees.
 *
 * A message is shown as READ to its author when somebody other than the author
 * has read it *and* that reader has not hidden their read receipts. Receipts
 * from readers who hide them are still stored (they drive the reader's own
 * counters) but never reveal themselves here. The receipts list itself is
 * removed from the result: who read what is not part of the API.
 */
export async function applyReadStatus<T extends MessageWithReceipts>(
  messages: T[],
  viewerId: string,
  privacy: PrivacyService,
): Promise<Array<Omit<T, 'readReceipts'>>> {
  const readerIds = new Set<string>();
  for (const message of messages) {
    if (message.senderId !== viewerId) continue;
    for (const receipt of message.readReceipts ?? []) {
      if (receipt.userId !== message.senderId) readerIds.add(receipt.userId);
    }
  }

  const flags = readerIds.size > 0 ? await privacy.getFlagsFor([...readerIds]) : {};

  return messages.map((message) => {
    const { readReceipts, ...rest } = message;
    const isRead =
      message.senderId === viewerId &&
      (readReceipts ?? []).some(
        (receipt) =>
          receipt.userId !== message.senderId && flags[receipt.userId]?.showReadReceipts !== false,
      );

    return { ...rest, status: isRead ? 'READ' : message.status };
  });
}
