import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const BACKUP_CODE_COUNT = 10;
/** An authenticator-app code; anything else is treated as a recovery code. */
const TOTP_PATTERN = /^\d{6}$/;

@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  async setup(userId: string): Promise<{ secret: string; qrCodeDataUrl: string; enabled: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { emails: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.twoFactorCredential.findUnique({
      where: { userId },
    });

    if (existing?.isEnabled) {
      throw new ConflictException({
        message: 'Two-factor authentication is already enabled.',
        code: '2FA_ALREADY_ENABLED',
      });
    }

    const secret = authenticator.generateSecret();
    const primaryEmail = user.emails.find((email) => email.isPrimary)?.email;
    const accountName = primaryEmail ?? user.username ?? user.id;
    const otpauthUrl = authenticator.keyuri(accountName, 'FLUX', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await this.prisma.twoFactorCredential.upsert({
      where: { userId },
      create: {
        userId,
        secret,
        isEnabled: false,
      },
      update: {
        secret,
        isEnabled: false,
      },
    });

    return { secret, qrCodeDataUrl, enabled: false };
  }

  async enable(userId: string, code: string): Promise<{ enabled: boolean; backupCodes: string[] }> {
    const credential = await this.prisma.twoFactorCredential.findUnique({
      where: { userId },
    });

    if (!credential) {
      throw new NotFoundException({
        message: 'Call /auth/2fa/setup first.',
        code: '2FA_SETUP_REQUIRED',
      });
    }

    const valid = authenticator.check(code, credential.secret);
    if (!valid) {
      throw new BadRequestException({
        message: 'Invalid two-factor code.',
        code: '2FA_CODE_INVALID',
      });
    }

    // Recovery codes are shown exactly once, here; only their hashes are kept.
    const backup = this.generateBackupCodes();

    await this.prisma.twoFactorCredential.update({
      where: { userId },
      data: { isEnabled: true, backupCodes: backup.hashes },
    });

    return { enabled: true, backupCodes: backup.plain };
  }

  /**
   * Replaces the recovery codes with a fresh set. Requires a current TOTP code
   * (not a recovery code), so someone holding only a stolen recovery code
   * cannot mint a new batch.
   */
  async regenerateBackupCodes(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const credential = await this.prisma.twoFactorCredential.findUnique({ where: { userId } });

    if (!credential || !credential.isEnabled) {
      throw new NotFoundException({
        message: 'Two-factor authentication is not enabled.',
        code: '2FA_NOT_ENABLED',
      });
    }

    if (!TOTP_PATTERN.test(code.trim()) || !authenticator.check(code.trim(), credential.secret)) {
      throw new BadRequestException({
        message: 'Invalid two-factor code.',
        code: '2FA_CODE_INVALID',
      });
    }

    const backup = this.generateBackupCodes();
    await this.prisma.twoFactorCredential.update({
      where: { userId },
      data: { backupCodes: backup.hashes },
    });

    return { backupCodes: backup.plain };
  }

  private generateBackupCodes(): { plain: string[]; hashes: string[] } {
    const plain = Array.from({ length: BACKUP_CODE_COUNT }, () => {
      const raw = randomBytes(5).toString('hex'); // 10 hex chars, 40 bits
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    return { plain, hashes: plain.map((value) => this.hashBackupCode(value)) };
  }

  private hashBackupCode(code: string): string {
    return createHash('sha256').update(code.replace(/[\s-]/g, '').toLowerCase()).digest('hex');
  }

  async disable(userId: string, code: string): Promise<{ enabled: boolean }> {
    const credential = await this.prisma.twoFactorCredential.findUnique({
      where: { userId },
    });

    if (!credential || !credential.isEnabled) {
      throw new NotFoundException({
        message: 'Two-factor authentication is not enabled.',
        code: '2FA_NOT_ENABLED',
      });
    }

    // A recovery code may switch 2FA off too: that is its purpose when the
    // authenticator app is lost.
    const valid = await this.verify(userId, code);
    if (!valid) {
      throw new BadRequestException({
        message: 'Invalid two-factor code.',
        code: '2FA_CODE_INVALID',
      });
    }

    await this.prisma.twoFactorCredential.delete({
      where: { userId },
    });

    return { enabled: false };
  }

  async verify(userId: string, code: string): Promise<boolean> {
    const credential = await this.prisma.twoFactorCredential.findUnique({
      where: { userId },
    });

    if (!credential || !credential.isEnabled) {
      return false;
    }

    const candidate = code.trim();
    if (TOTP_PATTERN.test(candidate)) {
      return authenticator.check(candidate, credential.secret);
    }

    return this.consumeBackupCode(userId, candidate, credential.backupCodes);
  }

  /**
   * Spends a recovery code. The conditional `updateMany` makes it single-use
   * even under concurrency: of two simultaneous requests with the same code,
   * only the one that still finds the hash in the row updates it.
   */
  private async consumeBackupCode(
    userId: string,
    code: string,
    stored: string[],
  ): Promise<boolean> {
    const hash = this.hashBackupCode(code);
    if (!stored.includes(hash)) return false;

    const { count } = await this.prisma.twoFactorCredential.updateMany({
      where: { userId, backupCodes: { has: hash } },
      data: { backupCodes: stored.filter((item) => item !== hash) },
    });

    return count === 1;
  }

  async isEnabled(userId: string): Promise<boolean> {
    const credential = await this.prisma.twoFactorCredential.findUnique({
      where: { userId },
    });

    return Boolean(credential?.isEnabled);
  }
}
