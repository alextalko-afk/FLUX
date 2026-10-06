import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { ChatsService } from './chats.service';
import { InvitesService } from './invites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreatePrivateChatDto,
  CreateSecretChatDto,
  CreateGroupDto,
  CreateChannelDto,
  UpdateChatDto,
  AddMembersDto,
  UpdateMemberDto,
  SetMutedDto,
  SetPinnedDto,
  SetArchivedDto,
  ChatListQueryDto,
} from './dto/chats.dto';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly invitesService: InvitesService,
  ) {}

  @Get()
  async list(@CurrentUser('id') userId: string, @Query() query: ChatListQueryDto) {
    return this.chatsService.listChats(userId, query);
  }

  /** What an invite link points to, shown before the person joins. */
  @RateLimit({ limit: 30, windowSeconds: 60, scope: 'user' })
  @Get('invite/:token')
  async invitePreview(@CurrentUser('id') userId: string, @Param('token') token: string) {
    return this.invitesService.preview(userId, token);
  }

  @RateLimit({ limit: 20, windowSeconds: 60, scope: 'user' })
  @Post('invite/:token/join')
  @HttpCode(HttpStatus.OK)
  async inviteJoin(@CurrentUser('id') userId: string, @Param('token') token: string) {
    return this.invitesService.join(userId, token);
  }

  @Get(':id')
  async get(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) chatId: string) {
    return this.chatsService.getChat(userId, chatId);
  }

  @Post('private')
  async createPrivate(@CurrentUser('id') userId: string, @Body() dto: CreatePrivateChatDto) {
    return this.chatsService.createPrivateChat(userId, dto);
  }

  @RateLimit({ limit: 10, windowSeconds: 3600, scope: 'user' })
  @Post('secret')
  async createSecret(@CurrentUser('id') userId: string, @Body() dto: CreateSecretChatDto) {
    return this.chatsService.createSecretChat(userId, dto);
  }

  /** Public keys of the two devices a secret chat is bound to. */
  @Get(':id/secret')
  async secretInfo(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) chatId: string) {
    return this.chatsService.getSecretInfo(userId, chatId);
  }

  @Post('group')
  async createGroup(@CurrentUser('id') userId: string, @Body() dto: CreateGroupDto) {
    return this.chatsService.createGroup(userId, dto);
  }

  @Post('channel')
  async createChannel(@CurrentUser('id') userId: string, @Body() dto: CreateChannelDto) {
    return this.chatsService.createChannel(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: UpdateChatDto,
  ) {
    return this.chatsService.updateChat(userId, chatId, dto);
  }

  @Post(':id/members')
  async addMembers(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.chatsService.addMembers(userId, chatId, dto);
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.chatsService.removeMember(userId, chatId, memberId);
  }

  @Patch(':id/members/:memberId')
  async setMemberRole(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.chatsService.setMemberRole(userId, chatId, memberId, dto.role);
  }

  @Get(':id/invite-link')
  async getInviteLink(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
  ) {
    return this.invitesService.getLink(userId, chatId);
  }

  /** Creates the invite link, or replaces it so the previous URL stops working. */
  @RateLimit({ limit: 10, windowSeconds: 60, scope: 'user' })
  @Post(':id/invite-link')
  @HttpCode(HttpStatus.OK)
  async rotateInviteLink(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
  ) {
    return this.invitesService.rotateLink(userId, chatId);
  }

  @Delete(':id/invite-link')
  async revokeInviteLink(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
  ) {
    return this.invitesService.revokeLink(userId, chatId);
  }

  @Get(':id/admin-log')
  async adminLog(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.invitesService.adminLogFor(userId, chatId, 50, cursor || undefined);
  }

  @Get(':id/join-requests')
  async joinRequests(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) chatId: string) {
    return this.invitesService.listRequests(userId, chatId);
  }

  @Post(':id/join-requests/:requesterId/approve')
  @HttpCode(HttpStatus.OK)
  async approveJoin(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Param('requesterId', ParseUUIDPipe) requesterId: string,
  ) {
    return this.invitesService.approve(userId, chatId, requesterId);
  }

  @Delete(':id/join-requests/:requesterId')
  async rejectJoin(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Param('requesterId', ParseUUIDPipe) requesterId: string,
  ) {
    return this.invitesService.reject(userId, chatId, requesterId);
  }

  @Patch(':id/pin')
  async setPinned(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: SetPinnedDto,
  ) {
    return this.chatsService.setPinned(userId, chatId, dto.isPinned);
  }

  @Patch(':id/archive')
  async setArchived(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: SetArchivedDto,
  ) {
    return this.chatsService.setArchived(userId, chatId, dto.isArchived);
  }

  @Patch(':id/mute')
  async setMuted(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: SetMutedDto,
  ) {
    return this.chatsService.setMuted(userId, chatId, dto.isMuted);
  }

  @Delete(':id/leave')
  async leave(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) chatId: string) {
    return this.chatsService.leaveChat(userId, chatId);
  }
}
