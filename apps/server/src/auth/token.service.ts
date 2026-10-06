import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  role: string;
  scope: 'access' | '2fa';
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;

  constructor(private readonly configService: ConfigService) {
    const accessSecret = this.configService.get<string>('jwt.accessSecret');
    if (!accessSecret) {
      throw new Error('JWT_ACCESS_SECRET is not set');
    }

    this.accessSecret = accessSecret;
    this.accessTtlSeconds = Math.floor(
      this.ttlToMs(this.configService.get<string>('jwt.accessExpiration', '15m'), 15 * 60 * 1000) / 1000,
    );
    this.refreshTtlMs = this.ttlToMs(
      this.configService.get<string>('jwt.refreshExpiration', '30d'),
      30 * 24 * 60 * 60 * 1000,
    );
  }

  private ttlToMs(value: string, fallbackMs: number): number {
    const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim());
    if (!match) {
      return fallbackMs;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'ms':
        return amount;
      case 's':
        return amount * 1000;
      case 'm':
        return amount * 60 * 1000;
      case 'h':
        return amount * 60 * 60 * 1000;
      case 'd':
        return amount * 24 * 60 * 60 * 1000;
      default:
        return fallbackMs;
    }
  }

  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.accessSecret, {
      expiresIn: this.accessTtlSeconds,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, this.accessSecret) as AccessTokenPayload;
      if (payload.scope !== 'access') {
        throw new Error('Invalid token scope');
      }
      return payload;
    } catch {
      throw new UnauthorizedException({
        message: 'Invalid or expired access token.',
        code: 'ACCESS_TOKEN_INVALID',
      });
    }
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  createRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
    const raw = randomUUID();
    const hash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);

    return { raw, hash, expiresAt };
  }

  getRefreshMaxAgeMs(): number {
    return this.refreshTtlMs;
  }
}
