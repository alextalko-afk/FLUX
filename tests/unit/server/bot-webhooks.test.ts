import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  signWebhookPayload,
  webhookSignatureHeader,
  verifyWebhookSignature,
} from '../../../apps/server/src/bots/bot-webhooks.sign';

describe('bot webhook signing', () => {
  const secret = 'super-secret-value';
  const body = JSON.stringify({ event: 'message.new', chatId: 'c1' });

  it('produces a hex HMAC-SHA256 over the raw body', () => {
    const expected = createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');
    expect(signWebhookPayload(secret, body)).toBe(expected);
  });

  it('formats the header as sha256=<hex>', () => {
    expect(webhookSignatureHeader(secret, body)).toBe(
      `sha256=${signWebhookPayload(secret, body)}`,
    );
  });

  it('verifies a matching signature', () => {
    expect(
      verifyWebhookSignature(secret, body, webhookSignatureHeader(secret, body)),
    ).toBe(true);
  });

  it('accepts a bare hex digest', () => {
    expect(verifyWebhookSignature(secret, body, signWebhookPayload(secret, body))).toBe(
      true,
    );
  });

  it('rejects a tampered body', () => {
    expect(
      verifyWebhookSignature(secret, `${body} `, webhookSignatureHeader(secret, body)),
    ).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(
      verifyWebhookSignature('other-secret', body, webhookSignatureHeader(secret, body)),
    ).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    expect(verifyWebhookSignature(secret, body, 'sha256=deadbeef')).toBe(false);
    expect(verifyWebhookSignature(secret, body, '')).toBe(false);
  });
});
