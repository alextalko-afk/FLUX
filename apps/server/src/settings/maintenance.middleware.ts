import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TokenService } from '../auth/token.service';
import { SettingsService } from './settings.service';

/** Paths that keep working in maintenance mode, so an administrator can still sign in and switch it off. */
const OPEN_PREFIXES = ['/api/v1/auth', '/api/v1/admin', '/api/v1/health', '/api/v1/metrics'];

/** While `maintenanceMode` is on, everyone but administrators gets `503 MAINTENANCE`. */
@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(
    private readonly settings: SettingsService,
    private readonly tokens: TokenService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'OPTIONS' || !(await this.settings.get<boolean>('maintenanceMode'))) return next();
    // `req.path` is relative to where the middleware is mounted; the original URL always has the full path.
    const path = req.originalUrl.split('?')[0];
    if (OPEN_PREFIXES.some((p) => path.startsWith(p))) return next();

    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        if (this.tokens.verifyAccessToken(header.slice(7)).role === 'ADMIN') return next();
      } catch {
        // An invalid token is treated like no token.
      }
    }

    const message = (await this.settings.get<string>('maintenanceMessage')) || 'The service is under maintenance. Please try again later.';
    res.setHeader('Retry-After', '300');
    res.status(503).json({ statusCode: 503, code: 'MAINTENANCE', message });
  }
}
