import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeEvent } from '@FLUX/shared';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly TTL_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private key(userId: string): string {
    return `presence:${userId}`;
  }

  async setOnline(userId: string): Promise<void> {
    await this.redis.set(this.key(userId), '1', this.TTL_SECONDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { presence: 'ONLINE', lastSeenAt: new Date() },
    });
    this.realtime.broadcast(RealtimeEvent.USER_PRESENCE_ONLINE, {
      userId,
      timestamp: Date.now(),
    });
  }

  async setOffline(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
    await this.prisma.user.update({
      where: { id: userId },
      data: { presence: 'OFFLINE', lastSeenAt: new Date() },
    });
    this.realtime.broadcast(RealtimeEvent.USER_PRESENCE_OFFLINE, {
      userId,
      timestamp: Date.now(),
    });
  }

  async isOnline(userId: string): Promise<boolean> {
    const value = await this.redis.get(this.key(userId));
    return value === '1';
  }

  async refresh(userId: string): Promise<void> {
    const online = await this.isOnline(userId);
    if (online) {
      await this.redis.set(this.key(userId), '1', this.TTL_SECONDS);
    }
  }

  async getPresence(userIds: string[]): Promise<Record<string, 'ONLINE' | 'OFFLINE'>> {
    const result: Record<string, 'ONLINE' | 'OFFLINE'> = {};
    for (const id of userIds) {
      result[id] = (await this.isOnline(id)) ? 'ONLINE' : 'OFFLINE';
    }
    return result;
  }
}
