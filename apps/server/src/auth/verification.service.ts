import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailerService } from './mailer.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mailer: MailerService,
  ) {}

  private hashCode(code: string, target: string, type: string): string {
    return createHash('sha256').update(`${type}:${target}:${code}`).digest('hex');
  }

  private generateNumericCode(length = 6): string {
    // `randomInt` draws from the OS CSPRNG; `Math.random()` is predictable and
    // must never produce a code that grants access to an account.
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length);
    return randomInt(min, max).toString();
  }

  async createEmailVerificationCode(email: string, type = 'EMAIL_VERIFICATION'): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    const code = this.generateNumericCode();
    const codeHash = this.hashCode(code, normalizedEmail, type);

    await this.prisma.verificationCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        type,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: false,
      },
    });

    await this.mailer.sendVerificationEmail(normalizedEmail, code);
    return code;
  }

  /**
   * Issues a `PASSWORD_RESET` code and emails it. Uses the same 10-minute
   * expiry and hashed-at-rest storage as email verification, and the same
   * `verifyEmailCode(..., 'PASSWORD_RESET')` check consumes it.
   */
  async createPasswordResetCode(email: string): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    const code = this.generateNumericCode();
    const codeHash = this.hashCode(code, normalizedEmail, 'PASSWORD_RESET');

    await this.prisma.verificationCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: false,
      },
    });

    await this.mailer.sendPasswordResetEmail(normalizedEmail, code);
    return code;
  }

  /**
   * Issues a single-use `LOGIN_CODE` for passwordless sign-in. Same 10-minute
   * expiry, hashing and attempt lock as the other e-mail codes.
   */
  async createLoginCode(email: string): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    const code = this.generateNumericCode();

    await this.prisma.verificationCode.create({
      data: {
        email: normalizedEmail,
        codeHash: this.hashCode(code, normalizedEmail, 'LOGIN_CODE'),
        type: 'LOGIN_CODE',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: false,
      },
    });

    await this.mailer.sendLoginCodeEmail(normalizedEmail, code);
    return code;
  }

  /** Checks a code and consumes it. */
  async verifyEmailCode(email: string, code: string, type = 'EMAIL_VERIFICATION'): Promise<void> {
    const handle = await this.checkEmailCode(email, code, type);
    await this.consumeCode(handle);
  }

  /** Marks a code that passed {@link checkEmailCode} as used. */
  async consumeCode(handle: { id: string; attemptsKey: string }): Promise<void> {
    await this.redis.getClient().del(handle.attemptsKey);
    await this.prisma.verificationCode.update({
      where: { id: handle.id },
      data: { isUsed: true },
    });
  }

  /**
   * Validates a code (including the wrong-attempt lock) WITHOUT consuming it.
   *
   * Used where a second factor still has to pass before the code may be spent:
   * a failed TOTP must not burn a valid sign-in code, and a valid code must
   * not stay usable after the sign-in it was meant for succeeded.
   */
  async checkEmailCode(
    email: string,
    code: string,
    type = 'EMAIL_VERIFICATION',
  ): Promise<{ id: string; attemptsKey: string }> {
    return this.checkCode('email', email.toLowerCase().trim(), code, type);
  }

  private async checkCode(
    field: 'email' | 'phone',
    target: string,
    code: string,
    type: string,
  ): Promise<{ id: string; attemptsKey: string }> {
    const normalizedEmail = target;
    const redisClient = this.redis.getClient();
    const attemptsKey = `auth:verification:${type}:${normalizedEmail}`;
    const lockKey = `auth:verification-lock:${type}:${normalizedEmail}`;

    const locked = await redisClient.get(lockKey);
    if (locked) {
      throw new BadRequestException({
        message: 'Too many attempts. Try again later.',
        code: 'VERIFICATION_LOCKED',
      });
    }

    const record = await this.prisma.verificationCode.findFirst({
      where: {
        [field]: normalizedEmail,
        type,
        isUsed: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException({
        message: 'Verification code is invalid or expired.',
        code: 'VERIFICATION_CODE_INVALID',
      });
    }

    const expectedHash = this.hashCode(code, normalizedEmail, type);
    if (record.codeHash !== expectedHash) {
      const attempts = await redisClient.incr(attemptsKey);
      if (attempts === 1) {
        await redisClient.expire(attemptsKey, 900);
      }

      if (attempts >= 5) {
        await redisClient.set(lockKey, '1', 'EX', 900);
      }

      throw new BadRequestException({
        message: 'Verification code is invalid or expired.',
        code: 'VERIFICATION_CODE_INVALID',
      });
    }

    return { id: record.id, attemptsKey };
  }
}
