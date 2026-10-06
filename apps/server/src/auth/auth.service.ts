import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { VerificationService } from './verification.service';
import { TwoFactorService } from './two-factor.service';
import { SettingsService } from '../settings/settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

interface DeviceInfoInput {
  platform: string;
  browser: string;
  os: string;
  device: string;
}

/** A spent refresh token shown again within this time is a retry, not theft. */
const REFRESH_REUSE_GRACE_MS = 15_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly verificationService: VerificationService,
    private readonly twoFactorService: TwoFactorService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  private parseDeviceInfo(userAgent = ''): DeviceInfoInput {
    const ua = userAgent.toLowerCase();

    let browser = 'Unknown';
    if (ua.includes('edg/')) {
      browser = 'Edge';
    } else if (ua.includes('opr/') || ua.includes('opera')) {
      browser = 'Opera';
    } else if (ua.includes('firefox')) {
      browser = 'Firefox';
    } else if (ua.includes('chrome')) {
      browser = 'Chrome';
    } else if (ua.includes('safari')) {
      browser = 'Safari';
    }

    let os = 'Unknown';
    if (ua.includes('windows')) {
      os = 'Windows';
    } else if (ua.includes('mac os')) {
      os = 'macOS';
    } else if (ua.includes('linux')) {
      os = 'Linux';
    } else if (ua.includes('android')) {
      os = 'Android';
    } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) {
      os = 'iOS';
    }

    const platform = ua.includes('mobi') ? 'mobile' : 'desktop';

    return {
      platform,
      browser,
      os,
      device: 'Unknown',
    };
  }

  private dummyHash?: Promise<string>;

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwordService.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }

  async checkLoginLock(email: string): Promise<void> {
    const redisClient = this.redis.getClient();
    const lockKey = `auth:login-lock:${email}`;
    const locked = await redisClient.get(lockKey);

    if (locked) {
      throw new UnauthorizedException({
        message: 'Too many login attempts. Try again later.',
        code: 'LOGIN_LOCKED',
      });
    }
  }

  async registerFailedLogin(email: string): Promise<void> {
    const redisClient = this.redis.getClient();
    const attemptsKey = `auth:login-attempts:${email}`;
    const lockKey = `auth:login-lock:${email}`;

    const attempts = await redisClient.incr(attemptsKey);
    if (attempts === 1) {
      await redisClient.expire(attemptsKey, 900);
    }

    if (attempts >= 5) {
      await redisClient.set(lockKey, '1', 'EX', 900);
    }
  }

  async clearFailedLogin(email: string): Promise<void> {
    const redisClient = this.redis.getClient();
    await redisClient.del(`auth:login-attempts:${email}`);
  }

  async register(dto: RegisterDto): Promise<{
    userId: string;
    email: string;
    requiresVerification: boolean;
    devCode?: string;
  }> {
    if (!(await this.settings.get<boolean>('registrationOpen'))) {
      throw new ForbiddenException({ message: 'Registration is closed.', code: 'REGISTRATION_CLOSED' });
    }

    const email = this.normalizeEmail(dto.email);

    const existingEmail = await this.prisma.userEmail.findUnique({
      where: { email },
    });

    if (existingEmail) {
      throw new ConflictException({
        message: 'Email is already used.',
        code: 'EMAIL_ALREADY_USED',
      });
    }

    if (dto.username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });

      if (existingUsername) {
        throw new ConflictException({
          message: 'Username is already taken.',
          code: 'USERNAME_ALREADY_TAKEN',
        });
      }
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        username: dto.username || null,
        emails: {
          create: {
            email,
            isPrimary: true,
            isVerified: false,
          },
        },
        passwordCredential: {
          create: {
            hash: passwordHash,
          },
        },
      },
    });

    const code = await this.verificationService.createEmailVerificationCode(email);

    const response: {
      userId: string;
      email: string;
      requiresVerification: boolean;
      devCode?: string;
    } = {
      userId: user.id,
      email,
      requiresVerification: true,
    };

    if (this.configService.get<string>('nodeEnv', 'development') !== 'production') {
      response.devCode = code;
    }

    return response;
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ verified: boolean }> {
    const email = this.normalizeEmail(dto.email);

    await this.verificationService.verifyEmailCode(email, dto.code, 'EMAIL_VERIFICATION');

    const emailRecord = await this.prisma.userEmail.findUnique({
      where: { email },
    });

    if (!emailRecord) {
      throw new BadRequestException({
        message: 'Email not found.',
        code: 'EMAIL_NOT_FOUND',
      });
    }

    await this.prisma.userEmail.update({
      where: { id: emailRecord.id },
      data: { isVerified: true },
    });

    return { verified: true };
  }

  async resendVerification(dto: ResendVerificationDto): Promise<{
    sent: boolean;
    devCode?: string;
  }> {
    const email = this.normalizeEmail(dto.email);

    const emailRecord = await this.prisma.userEmail.findUnique({
      where: { email },
    });

    if (!emailRecord) {
      throw new BadRequestException({
        message: 'Email not found.',
        code: 'EMAIL_NOT_FOUND',
      });
    }

    if (emailRecord.isVerified) {
      throw new ConflictException({
        message: 'Email is already verified.',
        code: 'EMAIL_ALREADY_VERIFIED',
      });
    }

    const code = await this.verificationService.createEmailVerificationCode(email);

    const response: { sent: boolean; devCode?: string } = { sent: true };
    if (this.configService.get<string>('nodeEnv', 'development') !== 'production') {
      response.devCode = code;
    }

    return response;
  }

  /**
   * Starts a password reset. Always reports success so the endpoint cannot be
   * used to probe which emails have accounts; only a real address receives a
   * code. In non-production the code is echoed back to keep local testing
   * usable without a mail provider (same behaviour as email verification).
   */
  async requestPasswordReset(dto: ForgotPasswordDto): Promise<{
    sent: boolean;
    devCode?: string;
  }> {
    const email = this.normalizeEmail(dto.email);

    const emailRecord = await this.prisma.userEmail.findUnique({
      where: { email },
    });

    if (!emailRecord) {
      return { sent: true };
    }

    const code = await this.verificationService.createPasswordResetCode(email);

    const response: { sent: boolean; devCode?: string } = { sent: true };
    if (this.configService.get<string>('nodeEnv', 'development') !== 'production') {
      response.devCode = code;
    }

    return response;
  }

  /**
   * Consumes a `PASSWORD_RESET` code, rotates the password and revokes every
   * active session/refresh token so a previously stolen session cannot outlive
   * the password change.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ reset: boolean }> {
    const email = this.normalizeEmail(dto.email);

    await this.verificationService.verifyEmailCode(email, dto.code, 'PASSWORD_RESET');

    const emailRecord = await this.prisma.userEmail.findUnique({
      where: { email },
    });

    if (!emailRecord) {
      throw new BadRequestException({
        message: 'Email not found.',
        code: 'EMAIL_NOT_FOUND',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    await this.prisma.passwordCredential.upsert({
      where: { userId: emailRecord.userId },
      update: { hash: passwordHash },
      create: { userId: emailRecord.userId, hash: passwordHash },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: emailRecord.userId, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.prisma.session.updateMany({
      where: { userId: emailRecord.userId, isActive: true },
      data: { isActive: false },
    });
    await this.realtime.enforceActiveSessions(emailRecord.userId);

    return { reset: true };
  }

  async login(
    dto: LoginDto,
    userAgent: string,
    ip: string,
  ): Promise<{
    requiresTwoFactor?: boolean;
    user?: any;
    accessToken?: string;
    refreshToken?: string;
    refreshMaxAgeMs?: number;
  }> {
    const email = this.normalizeEmail(dto.email);

    await this.checkLoginLock(email);

    const emailRecord = await this.prisma.userEmail.findUnique({
      where: { email },
      include: { user: true },
    });

    // The password is checked first, and an unknown address costs the same hashing work,
    // so neither the response nor its timing tells a stranger whether an account exists.
    const passwordCredential = emailRecord
      ? await this.prisma.passwordCredential.findUnique({ where: { userId: emailRecord.userId } })
      : null;
    const passwordValid = await this.passwordService.verify(
      passwordCredential?.hash ?? (await this.getDummyHash()),
      dto.password,
    );

    if (!emailRecord || !passwordCredential || !passwordValid || emailRecord.user.deletedAt) {
      await this.registerFailedLogin(email);
      throw new UnauthorizedException({
        message: 'Invalid credentials.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const user = emailRecord.user;

    // Only someone who knows the password learns the state of the account.
    if (user.isBlocked) {
      throw new ForbiddenException({
        message: 'Account is blocked.',
        code: 'ACCOUNT_BLOCKED',
      });
    }

    if (!emailRecord.isVerified) {
      throw new ForbiddenException({
        message: 'Email is not verified.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const twoFactorEnabled = await this.twoFactorService.isEnabled(user.id);
    if (twoFactorEnabled) {
      if (!dto.totp) {
        return { requiresTwoFactor: true };
      }

      const totpValid = await this.twoFactorService.verify(user.id, dto.totp);
      if (!totpValid) {
        await this.registerFailedLogin(email);
        throw new UnauthorizedException({
          message: 'Invalid two-factor code.',
          code: '2FA_CODE_INVALID',
        });
      }
    }

    await this.clearFailedLogin(email);

    return this.startSession(user, userAgent, ip);
  }

  /** An account that may sign in: not blocked and not deleted. */
  isUsable(user: { isBlocked: boolean; deletedAt: Date | null }): boolean {
    return !user.isBlocked && !user.deletedAt;
  }

  /** Creates the session, access token and refresh token for a signed-in user. */
  async startSession(
    user: { id: string; role: string },
    userAgent: string,
    ip: string,
  ): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
    refreshMaxAgeMs: number;
  }> {
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        userAgent,
        ip,
        isActive: true,
        deviceInfo: {
          create: this.parseDeviceInfo(userAgent),
        },
      },
    });

    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      sessionId: session.id,
      role: user.role,
      scope: 'access',
    });

    const refreshToken = this.tokenService.createRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        token: refreshToken.hash,
        expiresAt: refreshToken.expiresAt,
        isRevoked: false,
      },
    });

    return {
      user: await this.getMe(user.id),
      accessToken,
      refreshToken: refreshToken.raw,
      refreshMaxAgeMs: this.tokenService.getRefreshMaxAgeMs(),
    };
  }

  async refresh(userId: string, refreshTokenId: string): Promise<{
    accessToken: string;
    refreshToken: string;
    refreshMaxAgeMs: number;
  }> {
    const existingToken = await this.prisma.refreshToken.findUnique({
      where: { id: refreshTokenId },
    });

    if (!existingToken || existingToken.userId !== userId) {
      throw new UnauthorizedException({
        message: 'Refresh token is invalid.',
        code: 'REFRESH_TOKEN_INVALID',
      });
    }

    if (existingToken.expiresAt < new Date()) {
      throw new UnauthorizedException({
        message: 'Refresh token expired.',
        code: 'REFRESH_TOKEN_EXPIRED',
      });
    }

    // Spending the token is one atomic step, so two requests with the same token
    // cannot both get a new pair.
    const spent = await this.prisma.refreshToken.updateMany({
      where: { id: existingToken.id, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    if (spent.count === 0) {
      // A token that was already spent is shown again. Seconds later it is a retry
      // or a second tab; after that it is a copy, so the whole session is closed.
      const spentAt = existingToken.revokedAt?.getTime();
      if (spentAt && Date.now() - spentAt > REFRESH_REUSE_GRACE_MS && existingToken.sessionId) {
        await this.prisma.refreshToken.updateMany({
          where: { sessionId: existingToken.sessionId, isRevoked: false },
          data: { isRevoked: true, revokedAt: new Date() },
        });
        await this.prisma.session.updateMany({
          where: { id: existingToken.sessionId },
          data: { isActive: false },
        });
        await this.realtime.enforceActiveSessions(userId);
      }
      throw new UnauthorizedException({
        message: 'Refresh token is invalid.',
        code: 'REFRESH_TOKEN_INVALID',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.isBlocked || user.deletedAt) {
      throw new UnauthorizedException({
        message: 'User is unavailable.',
        code: 'USER_UNAVAILABLE',
      });
    }

    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      sessionId: existingToken.sessionId ?? '',
      role: user.role,
      scope: 'access',
    });

    const refreshToken = this.tokenService.createRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId: existingToken.sessionId,
        token: refreshToken.hash,
        expiresAt: refreshToken.expiresAt,
        isRevoked: false,
      },
    });

    // Keep "last active" accurate for the sessions list. `updateMany` is a
    // no-op if the session row was already removed.
    if (existingToken.sessionId) {
      await this.prisma.session.updateMany({
        where: { id: existingToken.sessionId },
        data: { lastActiveAt: new Date() },
      });
    }

    return {
      accessToken,
      refreshToken: refreshToken.raw,
      refreshMaxAgeMs: this.tokenService.getRefreshMaxAgeMs(),
    };
  }

  async logout(refreshTokenId: string): Promise<{ loggedOut: boolean }> {
    await this.prisma.refreshToken.update({
      where: { id: refreshTokenId },
      data: { isRevoked: true },
    });

    return { loggedOut: true };
  }

  async getMe(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        emails: true,
        phones: true,
        twoFactorCredential: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      role: user.role,
      presence: user.presence,
      lastSeenAt: user.lastSeenAt,
      isBlocked: user.isBlocked,
      emails: user.emails.map((item) => ({
        id: item.id,
        email: item.email,
        isPrimary: item.isPrimary,
        isVerified: item.isVerified,
      })),
      phones: user.phones.map((item) => ({
        id: item.id,
        phone: item.phone,
        isPrimary: item.isPrimary,
        isVerified: item.isVerified,
      })),
      twoFactorEnabled: Boolean(user.twoFactorCredential?.isEnabled),
      twoFactorBackupCodesRemaining: user.twoFactorCredential?.isEnabled
        ? user.twoFactorCredential.backupCodes.length
        : 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
