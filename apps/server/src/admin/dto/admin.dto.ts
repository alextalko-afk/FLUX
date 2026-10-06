import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum AdminUserAction {
  BAN = 'BAN',
  UNBAN = 'UNBAN',
  RESET_PASSWORD = 'RESET_PASSWORD',
  REVOKE_SESSIONS = 'REVOKE_SESSIONS',
  DELETE = 'DELETE',
  VERIFY = 'VERIFY',
  SET_ROLE = 'SET_ROLE',
}

export class AdminUserActionDto {
  @IsUUID()
  userId!: string;

  @IsEnum(AdminUserAction)
  action!: AdminUserAction;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword?: string;

  @IsOptional()
  @IsEnum(['USER', 'ADMIN', 'MODERATOR'])
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminChatActionDto {
  @IsUUID()
  chatId!: string;

  @IsEnum(['DELETE', 'ARCHIVE', 'UNARCHIVE'])
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminMessageActionDto {
  @IsUUID()
  messageId!: string;

  @IsEnum(['DELETE'])
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminResolveReportDto {
  @IsUUID()
  reportId!: string;

  @IsEnum(['RESOLVED', 'DISMISSED', 'ACTION_TAKEN'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  q?: string;
}

export class AdminDashboardQueryDto {
  @IsOptional()
  @IsString()
  range?: string;
}
