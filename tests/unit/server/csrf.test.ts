import { describe, it, expect } from 'vitest';
import {
  CsrfService,
  COOKIE_AUTHENTICATED_PATHS,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '../../../apps/server/src/security/csrf.service';

describe('CsrfService', () => {
  const csrf = new CsrfService();

  describe('issueToken', () => {
    it('returns 64 hex characters (32 bytes of entropy)', () => {
      const token = csrf.issueToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('never returns the same token twice', () => {
      const tokens = new Set(Array.from({ length: 200 }, () => csrf.issueToken()));
      expect(tokens.size).toBe(200);
    });
  });

  describe('matches', () => {
    it('accepts identical tokens', () => {
      const token = csrf.issueToken();
      expect(csrf.matches(token, token)).toBe(true);
    });

    it('rejects different tokens of equal length', () => {
      const a = csrf.issueToken();
      const b = csrf.issueToken();
      expect(csrf.matches(a, b)).toBe(false);
    });

    it('rejects a missing candidate', () => {
      expect(csrf.matches(undefined, csrf.issueToken())).toBe(false);
    });

    it('rejects a missing expected value', () => {
      expect(csrf.matches(csrf.issueToken(), undefined)).toBe(false);
    });

    it('rejects an empty candidate', () => {
      expect(csrf.matches('', csrf.issueToken())).toBe(false);
    });

    it('rejects a candidate that merely starts with the expected token', () => {
      const token = csrf.issueToken();
      expect(csrf.matches(`${token}extra`, token)).toBe(false);
    });
  });

  describe('isStateChanging', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('treats %s as state changing', (method) => {
      expect(csrf.isStateChanging(method)).toBe(true);
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])('treats %s as safe', (method) => {
      expect(csrf.isStateChanging(method)).toBe(false);
    });

    it('is case insensitive', () => {
      expect(csrf.isStateChanging('post')).toBe(true);
      expect(csrf.isStateChanging('get')).toBe(false);
    });
  });

  describe('hasBearerToken', () => {
    it('detects a bearer token', () => {
      expect(csrf.hasBearerToken('Bearer eyJhbGciOi')).toBe(true);
    });

    it('is case insensitive on the scheme', () => {
      expect(csrf.hasBearerToken('bearer abc')).toBe(true);
    });

    it('rejects an empty or missing header', () => {
      expect(csrf.hasBearerToken(undefined)).toBe(false);
      expect(csrf.hasBearerToken('')).toBe(false);
    });

    it('rejects a header with no token after the scheme', () => {
      expect(csrf.hasBearerToken('Bearer ')).toBe(false);
    });

    it('rejects other auth schemes', () => {
      expect(csrf.hasBearerToken('Basic dXNlcjpwYXNz')).toBe(false);
    });
  });

  describe('requiresVerification', () => {
    it('requires verification for POST /auth/refresh without a bearer token', () => {
      expect(
        csrf.requiresVerification({ method: 'POST', path: '/auth/refresh' }),
      ).toBe(true);
    });

    it('requires verification for POST /auth/logout without a bearer token', () => {
      expect(
        csrf.requiresVerification({ method: 'POST', path: '/auth/logout' }),
      ).toBe(true);
    });

    it('skips GET requests', () => {
      expect(
        csrf.requiresVerification({ method: 'GET', path: '/auth/refresh' }),
      ).toBe(false);
    });

    it('skips requests authenticated with a bearer token', () => {
      expect(
        csrf.requiresVerification({
          method: 'POST',
          path: '/auth/refresh',
          authorization: 'Bearer access-token',
        }),
      ).toBe(false);
    });

    it('skips cookie-authenticated routes that are not on the allow-list', () => {
      expect(
        csrf.requiresVerification({ method: 'POST', path: '/chats' }),
      ).toBe(false);
    });

    it('does not match a path that merely contains an allow-listed path', () => {
      expect(
        csrf.requiresVerification({ method: 'POST', path: '/auth/refresh/extra' }),
      ).toBe(false);
    });
  });

  describe('constants', () => {
    it('exposes both cookie-authenticated routes', () => {
      expect([...COOKIE_AUTHENTICATED_PATHS].sort()).toEqual([
        '/auth/logout',
        '/auth/refresh',
      ]);
    });

    it('uses a predictable cookie and header name', () => {
      expect(CSRF_COOKIE_NAME).toBe('csrf_token');
      expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
    });
  });
});
