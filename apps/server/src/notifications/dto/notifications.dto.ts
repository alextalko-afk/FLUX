import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubscribePushDto {
  @IsString()
  endpoint!: string;

  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  showPreview?: boolean;

  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  privateChats?: boolean;

  @IsOptional()
  @IsBoolean()
  groupChats?: boolean;

  @IsOptional()
  @IsBoolean()
  channels?: boolean;

  @IsOptional()
  @IsBoolean()
  mentions?: boolean;
}

export class OverrideChatNotificationDto {
  @IsUUID()
  chatId!: string;

  @IsOptional()
  @IsBoolean()
  muted?: boolean;

  @IsOptional()
  @IsEnum(['all', 'mentions', 'none'])
  mode?: string;
}

export class RegisterDeviceDto {
  @IsIn(['expo', 'fcm'])
  provider!: 'expo' | 'fcm';

  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';

  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;
}

export class UnregisterDeviceDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;
}
