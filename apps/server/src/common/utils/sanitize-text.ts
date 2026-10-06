/**
 * Control characters that have no place in chat text: everything below U+0020
 * except tab, line feed and carriage return, plus DEL and the C1 range.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Bidirectional override/isolate controls. They let a sender make text render
 * in a different order than it was written (`gpj.exe` shown as `exe.jpg`), so
 * they are removed from message text and file names.
 */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g;

/**
 * Normalises user-written text before it is stored: Unicode NFC, a single
 * newline style, no control or bidi-override characters.
 *
 * This is not HTML escaping. Message text is only ever rendered as text (React
 * escapes it, the API sends JSON), so escaping on the way in would corrupt
 * what the user typed and double-escape on display.
 */
export function normalizeUserText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(BIDI_CONTROLS, '');
}

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Returns the normalised absolute URL when it uses a safe scheme, otherwise
 * `null`. `javascript:`, `data:`, `vbscript:` and `file:` links must never be
 * stored: a client that renders them as an anchor would execute them on click.
 */
export function toSafeLinkUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!SAFE_LINK_PROTOCOLS.has(parsed.protocol)) return null;
  // Credentials in the authority are a classic phishing trick
  // (`https://bank.com@evil.test`), so they are rejected outright.
  if (parsed.username || parsed.password) return null;

  return parsed.toString();
}
