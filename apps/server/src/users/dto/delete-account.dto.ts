import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteAccountDto {
  /** Current password: deleting an account must not work from a stolen session alone. */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  /** Authenticator or recovery code; required when the account has 2FA. */
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  totp?: string;

  /**
   * Also erase the text of every message the account sent. Without it the
   * messages stay in the chats that still have other members, shown as sent by
   * "Deleted account".
   */
  @IsOptional()
  @IsBoolean()
  deleteMessages?: boolean;
}
