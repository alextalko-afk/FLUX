import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signs an outgoing bot webhook payload.
 *
 * The exact bytes that were sent must be passed as `body` — recomputing the
 * JSON on the receiving side is unsafe (key order / whitespace differ). The
 * receiver verifies by recomputing this over the raw request body.
 */
export function signWebhookPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/** The value of the `X-FLUX-Signature` header. */
export function webhookSignatureHeader(secret: string, body: string): string {
  return `sha256=${signWebhookPayload(secret, body)}`;
}

/**
 * Constant-time verification of an incoming signature. Accepts both the
 * `sha256=<hex>` header form and a bare hex digest.
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
): boolean {
  const provided = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = signWebhookPayload(secret, body);
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
