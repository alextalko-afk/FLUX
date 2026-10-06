import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatType, MessageStatus, RealtimeEvent } from '@FLUX/shared';
import { IsLatitude, IsLongitude, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUBLIC_USER_SELECT, projectMessage } from '../privacy/public-user';

export class ShareLocationDto {
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100000) accuracy?: number;
  @IsOptional() @IsString() @MaxLength(120) label?: string;

  /** Live location: how long the sender keeps updating it (1 minute to 8 hours). */
  @IsOptional() @IsInt() @Min(60) @Max(8 * 3600) liveSeconds?: number;
}

export class UpdateLocationDto {
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) accuracy?: number;
}

const MIN_UPDATE_INTERVAL_MS = 2000;

type LocationRow = { latitude: number; longitude: number; accuracy: number | null; label: string | null; liveUntil: Date | null; updatedAt: Date };

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  view(l: LocationRow) {
    return {
      latitude: l.latitude,
      longitude: l.longitude,
      accuracy: l.accuracy,
      label: l.label,
      liveUntil: l.liveUntil,
      isLive: Boolean(l.liveUntil && l.liveUntil.getTime() > Date.now()),
      updatedAt: l.updatedAt,
    };
  }

  async attach<T extends { id: string; type: string }>(items: T[]): Promise<(T & { location?: unknown })[]> {
    const ids = items.filter((i) => i.type === 'LOCATION').map((i) => i.id);
    if (ids.length === 0) return items;
    const rows = await this.prisma.messageLocation.findMany({ where: { messageId: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.messageId, this.view(r)]));
    return items.map((i) => (byId.has(i.id) ? { ...i, location: byId.get(i.id) } : i));
  }

  async share(userId: string, chatId: string, dto: ShareLocationDto) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, e2ee: true } });
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.type === ChatType.SECRET || chat.e2ee) {
      throw new BadRequestException({ message: 'Location sharing is not available in secret chats.', code: 'LOCATION_SECRET_CHAT' });
    }
    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        type: 'LOCATION',
        content: dto.label?.trim() ?? '',
        status: MessageStatus.SENT,
        location: {
          create: {
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy: dto.accuracy,
            label: dto.label?.trim() || null,
            liveUntil: dto.liveSeconds ? new Date(Date.now() + dto.liveSeconds * 1000) : null,
          },
        },
      },
      include: { sender: { select: PUBLIC_USER_SELECT }, media: true, location: true },
    });
    await this.prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

    const view = this.view(message.location!);
    const members = await this.prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_NEW, {
        chatId,
        message: { ...projectMessage(message as any, m.userId), location: view },
        isSelf: m.userId === userId,
      });
    }
    return { ...projectMessage(message as any, userId), location: view };
  }

  private async ownLive(userId: string, chatId: string, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatId, isDeleted: false },
      include: { location: true },
    });
    if (!message?.location) throw new NotFoundException('Location not found');
    if (message.senderId !== userId) throw new ForbiddenException('Not your location');
    return message.location;
  }

  async update(userId: string, chatId: string, messageId: string, dto: UpdateLocationDto) {
    const current = await this.ownLive(userId, chatId, messageId);
    if (!current.liveUntil || current.liveUntil.getTime() <= Date.now()) {
      throw new ConflictException({ message: 'Live location has ended.', code: 'LOCATION_ENDED' });
    }
    if (Date.now() - current.updatedAt.getTime() < MIN_UPDATE_INTERVAL_MS) {
      throw new HttpException({ message: 'Too many location updates.', code: 'LOCATION_RATE' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const next = await this.prisma.messageLocation.update({
      where: { id: current.id },
      data: { latitude: dto.latitude, longitude: dto.longitude, accuracy: dto.accuracy, updatedAt: new Date() },
    });
    return this.broadcast(chatId, messageId, next);
  }

  async stop(userId: string, chatId: string, messageId: string) {
    const current = await this.ownLive(userId, chatId, messageId);
    const next = await this.prisma.messageLocation.update({ where: { id: current.id }, data: { liveUntil: new Date() } });
    return this.broadcast(chatId, messageId, next);
  }

  private async broadcast(chatId: string, messageId: string, row: LocationRow) {
    const location = this.view(row);
    const members = await this.prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_UPDATED, { chatId, messageId, location });
    }
    return location;
  }
}
