import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsISO8601,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MessageType } from '@FLUX/shared';
import { normalizeUserText } from '../../common/utils/sanitize-text';
import { IsSafeLinkUrl } from '../../common/validators/is-safe-link-url';

/** Formatting spans a client may attach to message text. */
export const MESSAGE_ENTITY_TYPES = [
  'bold',
  'italic',
  'strikethrough',
  'code',
  'pre',
  'spoiler',
  'link',
  'mention',
  'hashtag',
] as const;

export class MessageEntityDto {
  @IsIn(MESSAGE_ENTITY_TYPES)
  type!: (typeof MESSAGE_ENTITY_TYPES)[number];

  /** Start of the span, in UTF-16 code units. */
  @IsInt()
  @Min(0)
  @Max(4096)
  offset!: number;

  @IsInt()
  @Min(1)
  @Max(4096)
  length!: number;

  @IsOptional()
  @IsSafeLinkUrl()
  url?: string;
}

export class SendMessageDto {
  @IsEnum(MessageType)
  type!: MessageType;

  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  @Transform(({ value }) => (typeof value === 'string' ? normalizeUserText(value) : value))
  content?: string;

  @IsOptional()
  @IsUUID()
  mediaId?: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MessageEntityDto)
  entities?: MessageEntityDto[];

  /** Voice/audio note length in whole seconds. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60 * 60 * 6)
  duration?: number;

  /** Normalised 0..1 amplitude samples used to draw the voice waveform. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(512)
  @IsNumber({}, { each: true })
  waveform?: number[];

  @IsUUID()
  clientTempId!: string;
}

export class EditMessageDto {
  @IsString()
  @MaxLength(4096)
  @Transform(({ value }) => (typeof value === 'string' ? normalizeUserText(value) : value))
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MessageEntityDto)
  entities?: MessageEntityDto[];
}

export class ForwardMessageDto {
  @IsArray()
  @IsUUID('4', { each: true })
  chatIds!: string[];
}

export class MessageHistoryQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  /** A topic id, or `general` for messages outside any topic. */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  topicId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

/**
 * Marks messages as read, either by listing them or by naming the newest one
 * the reader has seen (`upToMessageId`), which covers everything before it.
 */
export class MarkReadDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  messageIds?: string[];

  @IsOptional()
  @IsUUID()
  upToMessageId?: string;
}

export class ReactDto {
  @IsString()
  @MaxLength(16)
  emoji!: string;
}

export class ScheduleMessageDto {
  @IsString()
  @MaxLength(4096)
  @Transform(({ value }) => (typeof value === 'string' ? normalizeUserText(value) : value))
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MessageEntityDto)
  entities?: MessageEntityDto[];

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;

  /** ISO 8601 time at which the message is sent. */
  @IsISO8601()
  sendAt!: string;
}
