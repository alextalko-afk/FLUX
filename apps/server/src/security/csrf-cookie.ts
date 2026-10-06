import type { Response } from 'express';
import { CSRF_COOKIE_NAME, CsrfService } from './csrf.service';

/**
 * Path used for the CSRF cookie.
 *
 * Deliberately `/`: the browser only exposes a cookie to `document.cookie` when
 * its path matches the *page* URL, and the SPA lives at `/`, not under
 * `/api/v1/auth`. Scoping the CSRF cookie to the API path would therefore make
 * it unreadable by the client.
 *
 * This is safe because the CSRF token is not a credential on its own — the
 * refresh token keeps its narrow `/api/v1/auth` path, so it is still never sent
 * to the static SPA routes.
 */
export const CSRF_COOKIE_PATH = '/';

/**
 * Issues the readable CSRF cookie.
 *
 * `httpOnly: false` is intentional: the client must read this value in order to
 * echo it back in the `X-CSRF-Token` header. The protection comes from an
 * untrusted origin being unable to read the cookie nor send a matching custom
 * header, since that triggers a CORS preflight which only trusted origins pass.
 */
export function setCsrfCookie(res: Response, csrf: CsrfService, secure: boolean): string {
  const token = csrf.issueToken();
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: CSRF_COOKIE_PATH,
  });
  return token;
}

/** Removes the CSRF cookie, matching the attributes it was set with. */
export function clearCsrfCookie(res: Response, secure: boolean): void {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: CSRF_COOKIE_PATH,
  });
}
