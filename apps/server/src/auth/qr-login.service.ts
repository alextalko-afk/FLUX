import { Injectable, NotFoundException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';

const TTL_SECONDS = 120;

interface QrState {
  status: 'pending' | 'approved';
  userAgent: string;
  ip: string;
  userId?: string;
}

/**
 * Sign-in on a new device by scanning a QR code with one that is already signed in.
 *
 * The new device gets a random token (only its hash is kept), shows it as a QR code and
 * polls. The signed-in device opens the link, sees which device asks, and approves.
 * Completing the sign-in is single-use, and accounts with 2FA still need their second factor.
 */
@Injectable()
export class QrLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  private key(token: string): string {
    return `auth:qr:${createHash('sha256').update(token).digest('hex')}`;
  }

  private async load(token: string): Promise<QrState | null> {
    const raw = await this.redis.getClient().get(this.key(token));
    return raw ? (JSON.parse(raw) as QrState) : null;
  }

  async create(userAgent: string, ip: string) {
    const token = randomBytes(24).toString('base64url');
    const state: QrState = { status: 'pending', userAgent: userAgent.slice(0, 200), ip };
    await this.redis.getClient().set(this.key(token), JSON.stringify(state), 'EX', TTL_SECONDS);

    const base = this.config.get<string>('frontendUrl') || 'http://localhost:5173';
    const url = `${base.replace(/\/$/, '')}/qr-login?token=${token}`;
    return {
      token,
      expiresInSeconds: TTL_SECONDS,
      url,
      qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }),
    };
  }

  async status(token: string) {
    const state = await this.load(token);
    if (!state) return { status: 'expired' as const };
    if (state.status === 'pending') return { status: 'pending' as const };
    const requiresTwoFactor = await this.twoFactor.isEnabled(state.userId!);
    return { status: 'approved' as const, requiresTwoFactor };
  }

  /** What the approving device shows before confirming: which device is asking. */
  async preview(token: string) {
    const state = await this.load(token);
    if (!state || state.status !== 'pending') throw new NotFoundException({ message: 'QR code expired.', code: 'QR_EXPIRED' });
    return { userAgent: state.userAgent, ip: state.ip };
  }

  async approve(userId: string, token: string) {
    const state = await this.load(token);
    if (!state || state.status !== 'pending') throw new NotFoundException({ message: 'QR code expired.', code: 'QR_EXPIRED' });
    const ttl = await this.redis.getClient().ttl(this.key(token));
    const next: QrState = { ...state, status: 'approved', userId };
    await this.redis.getClient().set(this.key(token), JSON.stringify(next), 'EX', Math.max(ttl, 1));
    return { approved: true };
  }

  async complete(token: string, totp: string | undefined, userAgent: string, ip: string) {
    const state = await this.load(token);
    if (!state) throw new NotFoundException({ message: 'QR code expired.', code: 'QR_EXPIRED' });
    if (state.status !== 'approved' || !state.userId) {
      throw new ConflictException({ message: 'Not approved yet.', code: 'QR_NOT_APPROVED' });
    }

    const user = await this.prisma.user.findUnique({ where: { id: state.userId } });
    if (!user || !this.auth.isUsable(user)) throw new UnauthorizedException('Account unavailable');

    if (await this.twoFactor.isEnabled(user.id)) {
      if (!totp) return { requiresTwoFactor: true as const };
      if (!(await this.twoFactor.verify(user.id, totp))) {
        throw new UnauthorizedException({ message: 'Invalid two-factor code.', code: '2FA_CODE_INVALID' });
      }
    }

    // GETDEL makes the token single-use even when two requests race.
    const taken = await this.redis.getClient().getdel(this.key(token));
    if (!taken) throw new NotFoundException({ message: 'QR code expired.', code: 'QR_EXPIRED' });
    return this.auth.startSession(user, userAgent, ip);
  }
}
