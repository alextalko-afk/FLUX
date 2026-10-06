import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeUserText } from '../common/utils/sanitize-text';
import { RegisterDeviceDto } from './dto/device.dto';

export const MAX_ACTIVE_DEVICES = 20;

/**
 * Public keys of a user's devices, used for end-to-end encrypted ("secret")
 * chats. The server stores and serves public keys only: each device creates
 * its own key pair and keeps the private half to itself.
 */
@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registers the device's public key, or refreshes it if it is already known. */
  async register(userId: string, dto: RegisterDeviceDto) {
    // The regex checks the shape; decoding checks it really is 32 bytes.
    const decoded = Buffer.from(dto.publicKey, 'base64');
    if (decoded.length !== 32 || decoded.toString('base64') !== dto.publicKey) {
      throw new BadRequestException({
        message: 'publicKey must be a base64 encoded 32-byte key.',
        code: 'DEVICE_KEY_INVALID',
      });
    }

    const existing = await this.prisma.deviceKey.findUnique({
      where: { userId_publicKey: { userId, publicKey: dto.publicKey } },
    });

    if (existing) {
      if (existing.revokedAt) {
        throw new BadRequestException({
          message: 'This device key was revoked. Create a new one on the device.',
          code: 'DEVICE_KEY_REVOKED',
        });
      }
      const touched = await this.prisma.deviceKey.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return this.view(touched);
    }

    const active = await this.prisma.deviceKey.count({ where: { userId, revokedAt: null } });
    if (active >= MAX_ACTIVE_DEVICES) {
      throw new BadRequestException({
        message: `At most ${MAX_ACTIVE_DEVICES} devices can hold secret chat keys. Revoke one first.`,
        code: 'DEVICE_LIMIT_REACHED',
      });
    }

    const created = await this.prisma.deviceKey.create({
      data: {
        userId,
        publicKey: dto.publicKey,
        label: dto.label ? normalizeUserText(dto.label).trim() || null : null,
      },
    });
    return this.view(created);
  }

  async list(userId: string) {
    const devices = await this.prisma.deviceKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: devices.map((device) => this.view(device)) };
  }

  /**
   * Revokes a device key. Secret chats bound to it stay in the list but can no
   * longer be continued: nothing may silently re-encrypt them to another key.
   */
  async revoke(userId: string, deviceKeyId: string) {
    const device = await this.prisma.deviceKey.findFirst({ where: { id: deviceKeyId, userId } });
    if (!device) throw new NotFoundException('Device not found');

    if (!device.revokedAt) {
      await this.prisma.deviceKey.update({
        where: { id: device.id },
        data: { revokedAt: new Date() },
      });
    }
    return { revoked: true };
  }

  private view(device: {
    id: string;
    publicKey: string;
    label: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
  }) {
    return {
      id: device.id,
      publicKey: device.publicKey,
      label: device.label,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      revoked: device.revokedAt !== null,
    };
  }
}
