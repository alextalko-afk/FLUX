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
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { CreateFolderDto, ReorderFoldersDto, UpdateFolderDto } from './dto/folders.dto';
import { FoldersService } from './folders.service';

@Controller('folders')
@UseGuards(JwtAuthGuard)
@RateLimit({ limit: 60, windowSeconds: 60, scope: 'user' })
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    return this.foldersService.list(userId);
  }

  @Post()
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateFolderDto) {
    return this.foldersService.create(userId, dto);
  }

  /** Sets the order of the folders; `folderIds` lists them first to last. */
  @Put('order')
  @HttpCode(HttpStatus.OK)
  async reorder(@CurrentUser('id') userId: string, @Body() dto: ReorderFoldersDto) {
    return this.foldersService.reorder(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.foldersService.update(userId, folderId, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) folderId: string,
  ) {
    return this.foldersService.remove(userId, folderId);
  }
}
