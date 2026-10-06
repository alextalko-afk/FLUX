import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PresenceService } from '../presence/presence.service';
import { PrivacyService } from '../privacy/privacy.service';
import { PUBLIC_USER_SELECT, projectUser } from '../privacy/public-user';
import { InitiateCallDto, CallHistoryQueryDto } from './dto/calls.dto';
import { CallStatus, RealtimeEvent } from '@FLUX/shared';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly presence: PresenceService,
    private readonly privacy: PrivacyService,
    private readonly config: ConfigService,
  ) {}

  /**
   * ICE servers handed to the browser.
   *
   * Without this the client had no way to learn the TURN credentials, so
   * `window.__TURN_URL__` was always undefined and only public STUN was used —
   * which is exactly the configuration that fails between two NATs.
   */
  getIceServers() {
    const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [];

    const stun = this.config.get<string>('webrtc.stunServerUrl', 'stun:stun.l.google.com:19302');
    if (stun) iceServers.push({ urls: stun });

    const turnUrl = this.config.get<string>('webrtc.turnServerUrl');
    const turnUser = this.config.get<string>('webrtc.turnUsername');
    const turnCred = this.config.get<string>('webrtc.turnCredential');

    // Only advertise TURN when it is actually configured; a dead entry makes
    // ICE gathering slower without helping.
    if (turnUrl && turnUser && turnCred) {
      iceServers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
    }

    return iceServers;
  }

  async initiate(userId: string, dto: InitiateCallDto) {
    if (userId === dto.targetUserId) {
      throw new BadRequestException('Cannot call yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.targetUserId },
    });
    if (!target || target.isBlocked) {
      throw new NotFoundException('User not found');
    }

    const blocked = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { ownerId: userId, targetId: dto.targetUserId },
          { ownerId: dto.targetUserId, targetId: userId },
        ],
      },
    });
    if (blocked) {
      throw new ForbiddenException('Cannot call this user');
    }

    if (!(await this.privacy.allowsCalls(dto.targetUserId))) {
      throw new ForbiddenException('This user does not accept calls');
    }

    const call = await this.prisma.call.create({
      data: {
        type: dto.type,
        status: CallStatus.INITIATING,
        participants: {
          create: [
            { userId, joinedAt: new Date() },
            { userId: dto.targetUserId, joinedAt: new Date() },
          ],
        },
      },
      include: { participants: true },
    });

    this.realtime.emitToUser(dto.targetUserId, RealtimeEvent.CALL_INCOMING, {
      callId: call.id,
      callerId: userId,
      type: dto.type,
      timestamp: Date.now(),
    });

    return {
      callId: call.id,
      status: call.status,
      type: call.type,
      iceServers: this.getIceServers(),
    };
  }

  async accept(userId: string, callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { participants: true },
    });
    if (!call) throw new NotFoundException('Call not found');

    const participant = call.participants.find((p) => p.userId === userId);
    if (!participant) throw new ForbiddenException('Not a participant');

    if (call.status !== CallStatus.INITIATING && call.status !== CallStatus.RINGING) {
      throw new BadRequestException('Call cannot be accepted');
    }

    await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.ACTIVE,
        startedAt: new Date(),
      },
    });

    await this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { joinedAt: new Date() },
    });

    const caller = call.participants.find((p) => p.userId !== userId);
    if (caller) {
      this.realtime.emitToUser(caller.userId, RealtimeEvent.CALL_ACCEPTED, {
        callId,
        timestamp: Date.now(),
      });
    }

    return { accepted: true, iceServers: this.getIceServers() };
  }

  async reject(userId: string, callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { participants: true },
    });
    if (!call) throw new NotFoundException('Call not found');

    const participant = call.participants.find((p) => p.userId === userId);
    if (!participant) throw new ForbiddenException('Not a participant');

    await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.REJECTED,
        endedAt: new Date(),
      },
    });

    const other = call.participants.find((p) => p.userId !== userId);
    if (other) {
      this.realtime.emitToUser(other.userId, RealtimeEvent.CALL_REJECTED, {
        callId,
        timestamp: Date.now(),
      });
    }

    return { rejected: true };
  }

  async end(userId: string, callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { participants: true },
    });
    if (!call) throw new NotFoundException('Call not found');

    const participant = call.participants.find((p) => p.userId === userId);
    if (!participant) throw new ForbiddenException('Not a participant');

    await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.ENDED,
        endedAt: new Date(),
      },
    });

    await this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });

    const others = call.participants.filter((p) => p.userId !== userId);
    for (const other of others) {
      this.realtime.emitToUser(other.userId, RealtimeEvent.CALL_ENDED, {
        callId,
        timestamp: Date.now(),
      });
    }

    return { ended: true };
  }

  async getHistory(userId: string, query: CallHistoryQueryDto) {
    const take = query.limit ?? 50;

    const calls = await this.prisma.call.findMany({
      where: {
        participants: { some: { userId } },
      },
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          include: { user: { select: PUBLIC_USER_SELECT } },
        },
      },
    });

    return {
      items: calls.map((call) => ({
        id: call.id,
        type: call.type,
        status: call.status,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        createdAt: call.createdAt,
        participants: call.participants.map((p) => ({
          userId: p.userId,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
          user: p.user
            ? {
                id: p.user.id,
                username: p.user.username,
                firstName: p.user.firstName,
                lastName: p.user.lastName,
                // Honour the owner's "show profile photo" switch for this viewer.
                avatarUrl: projectUser(p.user, userId).avatarUrl,
              }
            : null,
        })),
      })),
      nextCursor: calls.length === take ? calls[calls.length - 1]?.id || null : null,
    };
  }
}
