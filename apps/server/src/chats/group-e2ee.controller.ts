import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GroupE2eeService } from './group-e2ee.service';

class ShareDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  deviceKeyId!: string;

  @IsString()
  @MaxLength(400)
  sealed!: string;
}

class PutSharesDto {
  @IsInt()
  @Min(0)
  @Max(999999)
  epoch!: number;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ShareDto)
  shares!: ShareDto[];
}

@Controller('chats/:id/e2ee')
@UseGuards(JwtAuthGuard)
export class GroupE2eeController {
  constructor(private readonly service: GroupE2eeService) {}

  /** Current epoch, my sealed keys and which members still need one. */
  @Get()
  info(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) chatId: string) {
    return this.service.info(userId, chatId);
  }

  @Put('shares')
  put(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) chatId: string, @Body() dto: PutSharesDto) {
    return this.service.putShares(userId, chatId, dto.epoch, dto.shares);
  }
}
