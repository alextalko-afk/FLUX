import { BadRequestException } from '@nestjs/common';

/**
 * Wire format of an encrypted message: `e2e1.` followed by base64url of
 * `nonce || ciphertext`. A minimum length keeps a short plaintext such as
 * "hi" from ever matching by accident.
 */
export const SECRET_PAYLOAD = /^e2e1\.[A-Za-z0-9_-]{40,12000}$/;

/** Group variant: `e2g1.<epoch>.` followed by the same base64url body. */
export const GROUP_PAYLOAD = /^e2g1\.(\d{1,6})\.[A-Za-z0-9_-]{40,12000}$/;

const reject = (message: string, code = 'SECRET_PLAINTEXT_REJECTED'): never => {
  throw new BadRequestException({ message, code });
};

/**
 * What a secret chat (or an end-to-end encrypted group) accepts. The server
 * cannot read ciphertext, but it can refuse anything that is plainly not
 * ciphertext, so a client bug or a hand-written request can never leave
 * readable text behind in a chat that is advertised as end-to-end encrypted.
 * Attachments and formatting travel outside this protocol, so they are not
 * accepted at all.
 *
 * For a group, `group.keyEpoch` is the current key generation: a message
 * sealed with an older key (before a member left) is refused.
 */
export function assertSecretPayload(
  input: {
    type?: string;
    content?: string;
    mediaId?: string;
    entities?: unknown[];
  },
  group?: { keyEpoch: number },
): void {
  if (input.type !== undefined && input.type !== 'TEXT') {
    reject('Secret chats carry encrypted text messages only.');
  }
  if (input.mediaId) reject('Attachments are not available in secret chats.');
  if (input.entities && input.entities.length > 0) {
    reject('Formatting is not available in secret chats.');
  }
  if (group) {
    const match = input.content ? GROUP_PAYLOAD.exec(input.content) : null;
    if (!match) reject('Messages in an encrypted group must be end-to-end encrypted by the client.');
    if (Number(match![1]) !== group.keyEpoch) {
      reject('The group key changed, refresh it and send again.', 'E2EE_EPOCH_STALE');
    }
    return;
  }
  if (!input.content || !SECRET_PAYLOAD.test(input.content)) {
    reject('Messages in a secret chat must be end-to-end encrypted by the client.');
  }
}
