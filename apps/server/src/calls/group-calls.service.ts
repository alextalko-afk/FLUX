import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMemberRole, ChatType } from '@FLUX/shared';
import { IsBoolean, IsOptional } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUBLIC_USER_SELECT, projectUser } from '../privacy/public-user';
import { createLivekitToken } from './livekit-token';

export const GROUP_CALL_EVENT = 'groupcall.updated';

export class StartGroupCallDto {
  @IsOptional() @IsBoolean() withVideo?: boolean;
}

const CALL_CHAT_TYPES: string[] = [ChatType.GROUP, ChatType.CHANNEL];

/**
 * Calls of a whole group. Media goes through a LiveKit SFU (`LIVEKIT_URL`, `LIVEKIT_API_KEY`,
 * `LIVEKIT_API_SECRET`); FLUX decides who may join and hands out a short-lived, room-scoped token.
 * Without that configuration the feature answers 503 instead of failing half way.
 */
@Injectable()
export class GroupCallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService,
  ) {}

  private get livekit() {
    const url = this.config.get<string>('LIVEKIT_URL');
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException({ message: 'Group calls are not configured.', code: 'GROUP_CALLS_UNAVAILABLE' });
    }
    return { url, apiKey, apiSecret };
  }

  private get maxParticipants(): number {
    return Number(this.config.get<string>('GROUP_CALL_MAX_PARTICIPANTS')) || 50;
  }

  /** Whether the server can run group calls at all, so the UI can hide the button. */
  isConfigured(): boolean {
    return Boolean(this.config.get('LIVEKIT_URL') && this.config.get('LIVEKIT_API_KEY') && this.config.get('LIVEKIT_API_SECRET'));
  }

  private async member(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId }, include: { chat: { select: { type: true } } } });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    if (!CALL_CHAT_TYPES.includes(member.chat.type)) {
      throw new BadRequestException({ message: 'Group calls are for groups and channels.', code: 'GROUP_CALL_BAD_CHAT' });
    }
    return member;
  }

  private isAdmin(role: string) {
    return role === ChatMemberRole.OWNER || role === ChatMemberRole.ADMIN;
  }

  private async view(callId: string) {
    const call = await this.prisma.groupCall.findUnique({
      where: { id: callId },
      include: { participants: { where: { leftAt: null }, orderBy: { joinedAt: 'asc' } } },
    });
    if (!call) return null;
    const users = await this.prisma.user.findMany({
      where: { id: { in: call.participants.map((p) => p.userId) } },
      select: PUBLIC_USER_SELECT,
    });
    const byId = new Map(users.map((u) => [u.id, projectUser(u as any)]));
    return {
      id: call.id,
      chatId: call.chatId,
      startedById: call.startedById,
      withVideo: call.withVideo,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      participants: call.participants.map((p) => ({ userId: p.userId, joinedAt: p.joinedAt, user: byId.get(p.userId) ?? null })),
    };
  }

  private async broadcast(chatId: string, callId: string) {
    const call = await this.view(callId);
    const members = await this.prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    for (const m of members) this.realtime.emitToUser(m.userId, GROUP_CALL_EVENT, { chatId, call });
    return call;
  }

  private async tokenFor(userId: string, callId: string, chatId: string) {
    const lk = this.livekit;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return {
      url: lk.url,
      token: createLivekitToken({
        apiKey: lk.apiKey,
        apiSecret: lk.apiSecret,
        room: `${chatId}:${callId}`,
        identity: userId,
        name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || undefined,
      }),
    };
  }

  /** The running call of a chat, if any. */
  async current(userId: string, chatId: string) {
    await this.member(userId, chatId);
    const active = await this.prisma.groupCall.findFirst({ where: { chatId, endedAt: null }, orderBy: { startedAt: 'desc' } });
    return { configured: this.isConfigured(), call: active ? await this.view(active.id) : null };
  }

  /** Starts a call, or joins the one already running in the chat. */
  async start(userId: string, chatId: string, withVideo = false) {
    this.livekit;
    const member = await this.member(userId, chatId);
    if (member.chat.type === ChatType.CHANNEL && !this.isAdmin(member.role)) {
      throw new ForbiddenException({ message: 'Only admins can start a call in a channel.', code: 'CHANNEL_READ_ONLY' });
    }
    if (member.role === ChatMemberRole.RESTRICTED) {
      throw new ForbiddenException({ message: 'You are not allowed to start calls here.', code: 'MEMBER_RESTRICTED' });
    }

    const existing = await this.prisma.groupCall.findFirst({ where: { chatId, endedAt: null } });
    const call = existing ?? (await this.prisma.groupCall.create({ data: { chatId, startedById: userId, withVideo } }));
    return this.join(userId, call.id);
  }

  async join(userId: string, callId: string) {
    const call = await this.prisma.groupCall.findUnique({ where: { id: callId } });
    if (!call || call.endedAt) throw new NotFoundException({ message: 'Call has ended.', code: 'GROUP_CALL_ENDED' });
    await this.member(userId, call.chatId);
    this.livekit;

    const active = await this.prisma.groupCallParticipant.findMany({ where: { callId, leftAt: null }, select: { userId: true } });
    if (!active.some((p) => p.userId === userId)) {
      if (active.length >= this.maxParticipants) {
        throw new ConflictException({ message: 'The call is full.', code: 'GROUP_CALL_FULL' });
      }
      await this.prisma.groupCallParticipant.create({ data: { callId, userId } });
    }
    const view = await this.broadcast(call.chatId, callId);
    return { call: view, ...(await this.tokenFor(userId, callId, call.chatId)) };
  }

  async leave(userId: string, callId: string) {
    const call = await this.prisma.groupCall.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException({ message: 'Call not found.', code: 'GROUP_CALL_ENDED' });
    await this.prisma.groupCallParticipant.updateMany({ where: { callId, userId, leftAt: null }, data: { leftAt: new Date() } });

    // The last one out ends the call.
    const left = await this.prisma.groupCallParticipant.count({ where: { callId, leftAt: null } });
    if (left === 0 && !call.endedAt) await this.prisma.groupCall.update({ where: { id: callId }, data: { endedAt: new Date() } });
    return { call: await this.broadcast(call.chatId, callId) };
  }

  async end(userId: string, callId: string) {
    const call = await this.prisma.groupCall.findUnique({ where: { id: callId } });
    if (!call || call.endedAt) throw new NotFoundException({ message: 'Call has ended.', code: 'GROUP_CALL_ENDED' });
    const member = await this.member(userId, call.chatId);
    if (call.startedById !== userId && !this.isAdmin(member.role)) {
      throw new ForbiddenException('Only the starter or an admin can end the call');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.groupCallParticipant.updateMany({ where: { callId, leftAt: null }, data: { leftAt: now } }),
      this.prisma.groupCall.update({ where: { id: callId }, data: { endedAt: now } }),
    ]);
    return { call: await this.broadcast(call.chatId, callId) };
  }
}
