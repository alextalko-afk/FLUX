import {
  IsBoolean,
  IsOptional,
} from 'class-validator';

/**
 * Partial update of an account's privacy switches. Every field is optional so
 * the client can PATCH a single toggle without resending the whole object.
 */
export class UpdatePrivacyDto {
  @IsOptional()
  @IsBoolean()
  showLastSeen?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnlineStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  showProfilePhoto?: boolean;

  @IsOptional()
  @IsBoolean()
  showBio?: boolean;

  @IsOptional()
  @IsBoolean()
  showPhoneNumber?: boolean;

  @IsOptional()
  @IsBoolean()
  findByPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  showReadReceipts?: boolean;

  @IsOptional()
  @IsBoolean()
  showTypingStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  allowCalls?: boolean;

  @IsOptional()
  @IsBoolean()
  allowGroupInvites?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  allowForwarding?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSavingMedia?: boolean;

  @IsOptional()
  @IsBoolean()
  allowP2P?: boolean;
}
