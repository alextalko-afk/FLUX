import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Methods that a cross-site page must never be able to trigger on the user's
 * behalf. `GET`/`HEAD`/`OPTIONS` are safe by definition and are skipped.
 */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Endpoints that authenticate purely from the `refresh_token` cookie. These are
 * the only routes a CSRF attack can actually drive, because every other route
 * requires an `Authorization: Bearer` header, which the browser will never add
 * automatically on a cross-origin request.
 *
 * Paths are compared against the router path, so the global `api/v1` prefix is
 * already stripped and does not need to appear here.
 */
export const COOKIE_AUTHENTICATED_PATHS = new Set(['/auth/refresh', '/auth/logout']);

/**
 * Generates and validates the CSRF token used by the double-submit-cookie
 * scheme.
 *
 * Why double-submit: the refresh token lives in an `httpOnly` cookie, so a
 * cross-origin page cannot read it. The CSRF token is deliberately readable by
 * JavaScript (`httpOnly: false`) — the client copies it into the
 * `X-CSRF-Token` header. An attacker on another origin can neither read the
 * cookie nor set the matching header, because custom headers on a
 * cross-origin request trigger a CORS preflight that the server only allows for
 * trusted origins.
 */
@Injectable()
export class CsrfService {
  /** Mints a new random token. 32 bytes of entropy, hex encoded. */
  issueToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Derives the value stored in the cookie from the token the client sends, so
   * that a mismatch is detected without ever storing a secret server-side.
   * The digest is only used to keep a fixed-length comparison surface.
   */
  private digest(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
  }

  /** Constant-time comparison of a candidate token against the expected one. */
  matches(candidate: string | undefined, expected: string | undefined): boolean {
    if (!candidate || !expected) {
      return false;
    }
    const a = this.digest(candidate);
    const b = this.digest(expected);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }

  isStateChanging(method: string): boolean {
    return STATE_CHANGING_METHODS.has(method.toUpperCase());
  }

  /** Requests carrying a bearer token are immune to CSRF by design. */
  hasBearerToken(authorization: string | undefined): boolean {
    return typeof authorization === 'string' && /^Bearer\s+\S+/i.test(authorization);
  }

  /**
   * Whether CSRF verification is required for this request.
   *
   * Required only when all of the following hold:
   *  - the method changes state;
   *  - no `Authorization: Bearer` header is present;
   *  - the route is one of the cookie-authenticated endpoints.
   */
  requiresVerification(args: {
    method: string;
    path: string;
    authorization?: string | undefined;
  }): boolean {
    if (!this.isStateChanging(args.method)) {
      return false;
    }
    if (this.hasBearerToken(args.authorization)) {
      return false;
    }
    return COOKIE_AUTHENTICATED_PATHS.has(args.path);
  }
}
