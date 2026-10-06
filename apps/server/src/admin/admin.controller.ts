import { AdminTwoFactorGuard } from './admin-two-factor.guard';
import {
  Body,
  Controller,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminSystemService } from './admin-system.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AdminUserActionDto,
  AdminChatActionDto,
  AdminMessageActionDto,
  AdminResolveReportDto,
  AdminListQueryDto,
} from './dto/admin.dto';
import { UserRole } from '@FLUX/shared';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, AdminTwoFactorGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly system: AdminSystemService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  async listUsers(@Query() query: AdminListQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Post('users/action')
  @HttpCode(HttpStatus.OK)
  async userAction(
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminUserActionDto,
  ) {
    return this.adminService.performUserAction(adminId, dto);
  }

  @Get('users/:userId/sessions')
  async userSessions(
    @CurrentUser('id') adminId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.adminService.listSessions(adminId, userId);
  }

  @Get('chats')
  async listChats(@Query() query: AdminListQueryDto) {
    return this.adminService.listChats(query);
  }

  @Post('chats/action')
  @HttpCode(HttpStatus.OK)
  async chatAction(
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminChatActionDto,
  ) {
    return this.adminService.performChatAction(adminId, dto);
  }

  @Post('messages/action')
  @HttpCode(HttpStatus.OK)
  async messageAction(
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminMessageActionDto,
  ) {
    return this.adminService.performMessageAction(adminId, dto);
  }

  @Get('reports')
  async listReports(@Query() query: AdminListQueryDto) {
    return this.adminService.listReports(query);
  }

  @Post('reports/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveReport(
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminResolveReportDto,
  ) {
    return this.adminService.resolveReport(adminId, dto);
  }

  @Get('settings')
  async settings() {
    return this.system.listSettings();
  }

  @Patch('settings')
  async updateSettings(@CurrentUser('id') adminId: string, @Body() body: Record<string, unknown>) {
    return this.system.updateSettings(adminId, body);
  }

  @Get('queues')
  async queues() {
    return { items: await this.system.queueCounts() };
  }

  @Get('queues/:name/failed')
  async failedJobs(@Param('name') name: string) {
    return this.system.failedJobs(name);
  }

  @Post('queues/:name/retry-failed')
  @HttpCode(HttpStatus.OK)
  async retryFailed(@CurrentUser('id') adminId: string, @Param('name') name: string) {
    return this.system.retryFailed(adminId, name);
  }

  @Post('queues/:name/clean-failed')
  @HttpCode(HttpStatus.OK)
  async cleanFailed(@CurrentUser('id') adminId: string, @Param('name') name: string) {
    return this.system.cleanFailed(adminId, name);
  }

  @Get('audit')
  async auditLogs(
    @CurrentUser('id') adminId: string,
    @Query() query: AdminListQueryDto,
  ) {
    return this.adminService.listAuditLogs(adminId, query);
  }
}
