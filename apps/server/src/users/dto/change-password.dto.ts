import { IsNotCommonPassword } from '../../common/validators/is-not-common-password';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  // Mirrors the strength rule enforced at registration so a password cannot be
  // weakened by going through the change-password flow instead.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @IsNotCommonPassword()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/, {
    message:
      'Password must contain at least one lowercase letter, one uppercase letter and one digit',
  })
  newPassword!: string;
}
