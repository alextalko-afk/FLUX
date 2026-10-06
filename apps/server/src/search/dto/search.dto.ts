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

export enum SearchScope {
  USERS = 'users',
  CHATS = 'chats',
  MESSAGES = 'messages',
  MEDIA = 'media',
  ALL = 'all',
}

export class GlobalSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @IsOptional()
  @IsEnum(SearchScope)
  scope?: SearchScope;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ChatSearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class MessageSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  q!: string;

  @IsOptional()
  @IsUUID()
  chatId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
