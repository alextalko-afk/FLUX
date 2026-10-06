import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBotDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  name!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, {
    message: 'Username can only contain letters, numbers and underscores, length 3-32',
  })
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateBotCommandDto {
  @IsString()
  @Matches(/^\/[a-zA-Z0-9_]{1,32}$/, {
    message: 'Command must start with / and contain letters, numbers, underscores',
  })
  command!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;
}

export class CreateBotWebhookDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(128)
  secret!: string;
}

export class UpdateBotWebhookDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BotSendMessageDto {
  @IsUUID()
  chatId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;
}

export class BotEditMessageDto {
  @IsUUID()
  messageId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;
}

export class BotDeleteMessageDto {
  @IsUUID()
  messageId!: string;
}

export class BotInlineButtonDto {
  @IsString()
  @MaxLength(64)
  text!: string;

  /** Sent back to the bot as a `callback_query` when pressed. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  callbackData?: string;

  /** Opens this page as a mini-app inside the messenger. */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(512)
  webAppUrl?: string;
}

export class BotInlineKeyboardDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BotInlineButtonDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  row!: BotInlineButtonDto[];
}

export class BotSendMessageWithKeyboardDto extends BotSendMessageDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BotInlineKeyboardDto)
  @ArrayMaxSize(6)
  keyboard?: BotInlineKeyboardDto[];
}

export class BotCallbackDto {
  @IsUUID()
  messageId!: string;

  @IsString()
  @MaxLength(256)
  data!: string;
}

export class BotInlineQueryDto {
  @IsString()
  @MaxLength(64)
  bot!: string;

  @IsString()
  @MaxLength(256)
  q!: string;
}

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class BotCatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;
}

export class BotWebAppDto {
  @IsUUID()
  messageId!: string;

  @IsString()
  @MaxLength(512)
  url!: string;
}
