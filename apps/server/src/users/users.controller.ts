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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { UsersService } from './users.service';
import { AccountService } from './account.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { SearchUsersQueryDto } from './dto/search-users.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePrivacyDto } from '../privacy/dto/privacy.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountService: AccountService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  /**
   * Permanently deletes the caller's account. Needs the password (and a 2FA
   * code when enabled) in the body, so a stolen access token alone is not enough.
   */
  @RateLimit({ limit: 5, windowSeconds: 900, scope: 'user' })
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deleteMe(@CurrentUser('id') userId: string, @Body() dto: DeleteAccountDto) {
    return this.accountService.deleteAccount(userId, dto);
  }

  /** Downloads a JSON export of the caller's own data. */
  @RateLimit({ limit: 3, windowSeconds: 3600, scope: 'user' })
  @Get('me/export')
  async exportMe(@CurrentUser('id') userId: string, @Res() res: Response) {
    await this.accountService.exportData(userId, res);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateMe(userId, dto);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') sessionId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, dto, sessionId);
  }

  @Get('me/privacy')
  async getPrivacy(@CurrentUser('id') userId: string) {
    return this.usersService.getPrivacySettings(userId);
  }

  @Patch('me/privacy')
  async updatePrivacy(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePrivacyDto,
  ) {
    return this.usersService.updatePrivacySettings(userId, dto);
  }

  @Get('me/sessions')
  async listSessions(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') sessionId: string,
  ) {
    return this.usersService.listSessions(userId, sessionId);
  }

  @Post('me/sessions/terminate-all')
  @HttpCode(HttpStatus.OK)
  async terminateAllSessions(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') sessionId: string,
  ) {
    return this.usersService.terminateAllSessions(userId, sessionId);
  }

  @Post('me/sessions/:sessionId/terminate')
  @HttpCode(HttpStatus.OK)
  async terminateSession(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentSessionId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.usersService.terminateSession(userId, sessionId, currentSessionId);
  }

  @Get('search')
  async search(
    @CurrentUser('id') userId: string,
    @Query() query: SearchUsersQueryDto,
  ) {
    return this.usersService.search(userId, query);
  }

  @Get('blocked')
  async listBlocked(@CurrentUser('id') userId: string) {
    return this.usersService.listBlocked(userId);
  }

  @Post(':id/block')
  async block(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.usersService.blockUser(userId, targetId);
  }

  @Delete(':id/block')
  async unblock(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.usersService.unblockUser(userId, targetId);
  }

  @Get(':id/public')
  async getPublicProfile(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.usersService.getPublicProfile(userId, targetId);
  }
}
