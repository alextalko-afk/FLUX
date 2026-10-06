import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CsrfService,
} from './csrf.service';

const HTTP_CONTEXT = 'http';

/**
 * Rejects cross-origin state-changing requests that rely on cookie
 * authentication and do not carry a matching `X-CSRF-Token` header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType<string>() !== HTTP_CONTEXT) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const authorization = req.headers.authorization;

    if (
      !this.csrf.requiresVerification({
        method: req.method,
        path: req.path ?? '',
        authorization,
      })
    ) {
      return true;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    if (!cookieToken) {
      // No token issued yet (first request after a cold start). Allow the call
      // and let the response handler issue a fresh token.
      return true;
    }

    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;
    if (!this.csrf.matches(headerToken, cookieToken)) {
      throw new ForbiddenException({
        code: 'CSRF_TOKEN_MISMATCH',
        message: 'CSRF token missing or invalid. Reload the page and try again.',
      });
    }

    return true;
  }
}
