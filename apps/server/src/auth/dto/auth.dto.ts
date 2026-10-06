import { IsNotCommonPassword } from '../../common/validators/is-not-common-password';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @IsNotCommonPassword()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/, {
    message: 'Password must contain at least one lowercase letter, one uppercase letter and one digit',
  })
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, {
    message: 'Username can only contain letters, numbers and underscores, length 3-32',
  })
  username?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  totp?: string;
}

/** Starts a passwordless sign-in: a code is e-mailed to the address. */
export class LoginCodeRequestDto {
  @IsEmail()
  email!: string;
}

/** Completes a passwordless sign-in with the e-mailed code. */
export class LoginWithCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  /** Authenticator or recovery code; required when the account has 2FA. */
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  totp?: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @IsNotCommonPassword()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/, {
    message: 'Password must contain at least one lowercase letter, one uppercase letter and one digit',
  })
  password!: string;
}

export class TwoFactorVerifyDto {
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  code!: string;
}

export class TwoFactorEnableDto {
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  code!: string;
}

export class QrTokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  token!: string;
}

export class QrCompleteDto extends QrTokenDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  totp?: string;
}
